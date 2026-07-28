# @nk/auth

Librería TypeScript basada en Better Auth para componer autenticación en
servicios existentes. Incluye adaptadores opcionales para Nitro, PostgreSQL,
Resend y Vue.

La librería no inicia un servidor, no lee variables de entorno y no crea
conexiones al importarse. La aplicación consumidora conserva el control sobre
su configuración, rutas, secretos y ciclo de vida.

## Instalación

```bash
pnpm add @nk/auth
```

`better-auth`, `@better-auth/oauth-provider` y `@better-auth/passkey` son
dependencias directas. Cada integración adicional declara sus tecnologías
como peers opcionales:

| Entrada             | Dependencias del consumidor                |
| ------------------- | ------------------------------------------ |
| `@nk/auth/vue`      | `vue`                                      |
| `@nk/auth/nitro`    | `nitro`, `zod`                             |
| `@nk/auth/postgres` | `postgres`, `kysely`, `kysely-postgres-js` |
| `@nk/auth/resend`   | `resend`                                   |

## Crear el runtime

```ts
import { createAuth } from "@nk/auth";
import { createNodeScryptPasswordHasher } from "@nk/auth/password/node";
import { createPostgresAuthDatabase } from "@nk/auth/postgres";
import { createResendAuthMailer } from "@nk/auth/resend";

const config = loadApplicationConfig();

const database = createPostgresAuthDatabase({
    url: config.databaseURL,
});

const mailer = createResendAuthMailer({
    apiKey: config.resendApiKey,
    appName: config.appName,
    from: config.emailFrom,
    dashboardURL: config.dashboardURL,
});

export const auth = createAuth({
    secret: config.authSecret,
    baseURL: config.authBaseURL,
    appName: config.appName,
    database,
    mailer,
    passwordHasher: createNodeScryptPasswordHasher(),
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
    },
    features: {
        bearer: true,
        username: true,
        jwt: true,
    },
});
```

Los secretos pueden provenir de variables de entorno, Vault, Kubernetes
Secrets u otro proveedor. La librería sólo recibe el objeto ya resuelto.

La instancia expone un handler Fetch estándar y un cierre idempotente:

```ts
const response = await auth.handler(request);
await auth.close();
```

## Nitro

Nitro es un peer opcional. El servicio consumidor instala y ejecuta Nitro; la
librería sólo aporta handlers, middleware y plugins reutilizables.

```ts
// server/routes/auth/[...all].ts
import { createAuthHandler } from "@nk/auth/nitro";
import { auth } from "../../utils/auth";

export default createAuthHandler(auth);
```

La entrada `@nk/auth/nitro` también exporta:

- `createNitroAuthLifecyclePlugin`
- `createNitroCorsMiddleware`
- `createApiKeyGuard`
- `defineValidatedHandler`
- `defineAuthHandler`

## OAuth y rutas well-known

Better Auth puede responder el metadata desde el catch-all de autenticación,
pero algunos frameworks o clientes necesitan rutas explícitas. La librería
incluye handlers Fetch y adaptadores Nitro para ambos documentos.

Para un `basePath` `/auth`, las rutas calculadas son:

```ts
import { getAuthWellKnownPaths } from "@nk/auth/well-known";

getAuthWellKnownPaths("/auth");
// {
//   oauthAuthorizationServer: [
//     "/auth/.well-known/oauth-authorization-server",
//     "/.well-known/oauth-authorization-server/auth",
//   ],
//   openIDConfiguration: "/auth/.well-known/openid-configuration",
// }
```

### Fetch estándar

```ts
import {
    createOAuthAuthorizationServerMetadataHandler,
    createOpenIDConfigurationMetadataHandler,
} from "@nk/auth/well-known";

export const authorizationMetadata = createOAuthAuthorizationServerMetadataHandler(auth);

export const openIDMetadata = createOpenIDConfigurationMetadataHandler(auth);
```

Ambos aceptan `headers` opcionales para CORS o cache:

```ts
const metadata = createOAuthAuthorizationServerMetadataHandler(auth, {
    headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
    },
});
```

### Nitro

Para exponer el alias RFC 8414 insertado antes del issuer path:

```ts
// server/routes/.well-known/oauth-authorization-server/auth.get.ts
import { createNitroOAuthAuthorizationServerMetadataHandler } from "@nk/auth/nitro";
import { auth } from "../../../utils/auth";

export default createNitroOAuthAuthorizationServerMetadataHandler(auth);
```

Si el catch-all no recibe la ruta OpenID:

```ts
// server/routes/auth/.well-known/openid-configuration.get.ts
import { createNitroOpenIDConfigurationMetadataHandler } from "@nk/auth/nitro";
import { auth } from "../../../utils/auth";

export default createNitroOpenIDConfigurationMetadataHandler(auth);
```

## Vue

```ts
import { createApp } from "vue";
import { createAuthVuePlugin } from "@nk/auth/vue";

const app = createApp(App);
const authVue = createAuthVuePlugin();

app.use(authVue);
await authVue.client.signIn.email({ email, password });
```

El cliente usa el mismo origen y `/auth` por defecto. Incluye administración,
organizaciones, username, JWT, 2FA y passkeys.

Se puede personalizar con `baseURL`, `basePath`, plugins adicionales y los
anchors `resolveBaseURL`, `transformPlugins`, `transformOptions`,
`onClientCreated` y `onVueInstall`.

## Emails

Las plantillas de verificación, recuperación y bienvenida son defaults
reemplazables:

```ts
const mailer = createResendAuthMailer({
    apiKey: config.resendApiKey,
    appName: config.appName,
    from: config.emailFrom,
    templates: {
        verification(branding, input) {
            return {
                subject: `Activa tu cuenta en ${branding.appName}`,
                html: renderVerification(input),
            };
        },
    },
    hooks: {
        transformMessage(kind, message) {
            return instrumentMessage(kind, message);
        },
    },
});
```

## PostgreSQL y esquema

La migración SQL se publica dentro del paquete, pero nunca se ejecuta
automáticamente:

```ts
import { applyAuthMigrations, getAuthSchemaVersion } from "@nk/auth/postgres";

const currentVersion = await getAuthSchemaVersion(database);
const plan = await applyAuthMigrations(database, { dryRun: true });

await applyAuthMigrations(database);
```

## Extensión

El runtime ofrece puntos de extensión antes y después de construir Better
Auth:

```ts
const auth = createAuth({
    ...config,
    anchors: {
        transformPlugins(defaultPlugins) {
            return [...defaultPlugins, customPlugin()];
        },
        transformOptions(defaultOptions) {
            return customizeBetterAuth(defaultOptions);
        },
        onRuntimeCreated(runtime) {
            telemetry.register(runtime);
        },
    },
});
```

El preset `createNkAuth` también acepta `configure(defaults)` para modificar
su configuración de alto nivel.

## Desarrollo y empaquetado

```bash
pnpm install
pnpm format
pnpm check
pnpm pack:dry-run
```

`oxfmt` aplica el formato del repositorio y `oxlint` ejecuta reglas con
información de tipos y los diagnósticos de TypeScript mediante
`oxlint-tsgolint`. Se mantiene `tsc` para validar la generación de declaraciones
y el contrato público consumible.

El build usa `tsdown`, genera ESM, tipos y sourcemaps para cada entrada y valida
el resultado publicable con `publint`. `prepack` ejecuta todas las
verificaciones, por lo que un clon limpio genera `dist` antes de crear o
publicar el tarball.

`dist`, `node_modules`, tarballs y secretos locales permanecen ignorados por
Git. El código fuente de la librería vive directamente en `src` y sí debe
versionarse.

## Publicación

El campo `files` de `package.json` funciona como lista permitida, por lo que el
tarball sólo contiene `dist`, `README.md` y `package.json`; no hace falta
ignorar `src` ni crear un `.npmignore`.

Antes de la primera publicación:

1. Verifica que la cuenta u organización sea propietaria del scope `@nk`.
2. Actualiza la versión del paquete.
3. Decide la licencia. Actualmente figura `UNLICENSED`, apropiada para un
   registry privado; para distribución pública se debe escoger una licencia y
   agregar su archivo `LICENSE`.
4. Añade `repository`, `homepage` y `bugs` cuando exista el repositorio remoto.

Publicación pública en npm:

```bash
pnpm pack:dry-run
pnpm publish --access public
```

Para un registry privado:

```bash
pnpm publish --registry https://registry.example.com
```

No se debe guardar un token npm dentro del repositorio. Para CI es preferible
usar trusted publishing/OIDC.
