# @nk-sh/auth

A Better Auth-based TypeScript library for composing authentication into existing services.
It includes optional adapters for Nitro, PostgreSQL, Resend, and Vue.

The library does not start a server, read environment variables, or create connections when it
is imported. The consuming application retains control over its configuration, routes, secrets,
and lifecycle.

## Installation

```bash
pnpm add @nk-sh/auth
```

Install `@nk-sh/auth` in every backend or frontend package that imports it. In a monorepo, the
backend and the Vue application therefore declare it independently.

`better-auth`, `@better-auth/oauth-provider`, and `@better-auth/passkey` are direct dependencies
of this library. They require no additional installation when an application only imports public
APIs from `@nk-sh/auth`. If application code imports from any of those packages directly, it must
also declare that package as its own dependency.

The adapters below use optional peer dependencies. Optional means that an integration is optional
for `@nk-sh/auth`; it does not mean the dependency is optional after that integration is used.
Install these packages directly in the consuming package and do not rely on a package manager to
install or hoist peers automatically:

| Integration                       | Install in    | Required installation                                 |
| --------------------------------- | ------------- | ----------------------------------------------------- |
| `@nk-sh/auth/resend`              | Auth backend  | `pnpm add resend`                                     |
| `@nk-sh/auth/postgres`            | Auth backend  | `pnpm add postgres kysely kysely-postgres-js`         |
| `@nk-sh/auth/nitro`               | Nitro backend | `pnpm add nitro zod`                                  |
| `@nk-sh/auth/vue`                 | Vue frontend  | `pnpm add @nk-sh/auth vue`                            |
| Core and `@nk-sh/auth/presets/nk` | Auth backend  | No peers beyond the selected database/mailer adapters |

For example, the PostgreSQL and Resend backend shown below needs:

```bash
pnpm add @nk-sh/auth resend postgres kysely kysely-postgres-js
```

A Nitro service using the reusable handlers also needs:

```bash
pnpm add nitro zod
```

A custom database or mailer implementation does not require the PostgreSQL or Resend peers. Only
the imported adapter determines those dependencies.

## Creating the runtime

```ts
import { createAuth } from "@nk-sh/auth";
import { createNodeScryptPasswordHasher } from "@nk-sh/auth/password/node";
import { createPostgresAuthDatabase } from "@nk-sh/auth/postgres";
import { createResendAuthMailer } from "@nk-sh/auth/resend";

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

Secrets may come from environment variables, Vault, Kubernetes Secrets, or another provider. The
library only receives the already-resolved configuration object.

The instance exposes a standard Fetch handler and an idempotent close method:

```ts
const response = await auth.handler(request);
await auth.close();
```

## Nitro

Nitro is an optional peer dependency. The consuming service installs and runs Nitro; the library
only provides reusable handlers, middleware, and plugins.

```ts
// server/routes/auth/[...all].ts
import { createAuthHandler } from "@nk-sh/auth/nitro";
import { auth } from "../../utils/auth";

export default createAuthHandler(auth);
```

The `@nk-sh/auth/nitro` entry point also exports:

- `createNitroAuthLifecyclePlugin`
- `createNitroCorsMiddleware`
- `createApiKeyGuard`
- `defineValidatedHandler`
- `defineAuthHandler`
- `defineAccessTokenHandler`

## Separate auth and application databases

`nk-auth` owns identity data, credentials, sessions, OAuth clients, global service roles, and
optional organization membership. Each product application should keep its domain-specific role
assignments in its own database, using the immutable auth user ID (`sub` in an access token) as the
external key. Do not add a cross-database foreign key or let application services read the auth
database directly.

A protected app API can validate JWT access tokens locally and then load its own roles:

```ts
import { createAccessTokenVerifier } from "@nk-sh/auth/resource-server";

export const auth = createAccessTokenVerifier({
    issuer: "https://auth.example.com/auth",
    audience: "https://api.example.com",
    jwksURL: "https://auth.example.com/auth/jwks",
});
```

Scopes answer whether a client may call an API. Application permissions answer what the identified
user may do to a concrete resource. Both must be enforced on the server; Vue checks are only a user
interface convenience.

See [Authorization with separate application databases](./docs/authorization.md) for the complete
role model, schema example, custom Better Auth roles, Nitro guards, organization roles, and
operational guidance.

## OAuth and well-known routes

Better Auth can serve metadata from the authentication catch-all route, but some frameworks or
clients require explicit routes. The library includes Fetch handlers and Nitro adapters for both
documents.

For a `/auth` `basePath`, the computed routes are:

```ts
import { getAuthWellKnownPaths } from "@nk-sh/auth/well-known";

getAuthWellKnownPaths("/auth");
// {
//   oauthAuthorizationServer: [
//     "/auth/.well-known/oauth-authorization-server",
//     "/.well-known/oauth-authorization-server/auth",
//   ],
//   openIDConfiguration: "/auth/.well-known/openid-configuration",
// }
```

### Standard Fetch

```ts
import {
    createOAuthAuthorizationServerMetadataHandler,
    createOpenIDConfigurationMetadataHandler,
} from "@nk-sh/auth/well-known";

export const authorizationMetadata = createOAuthAuthorizationServerMetadataHandler(auth);

export const openIDMetadata = createOpenIDConfigurationMetadataHandler(auth);
```

Both handlers accept optional `headers` for CORS or caching:

```ts
const metadata = createOAuthAuthorizationServerMetadataHandler(auth, {
    headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
    },
});
```

### Nitro

To expose the RFC 8414 alias inserted before the issuer path:

```ts
// server/routes/.well-known/oauth-authorization-server/auth.get.ts
import { createNitroOAuthAuthorizationServerMetadataHandler } from "@nk-sh/auth/nitro";
import { auth } from "../../../utils/auth";

export default createNitroOAuthAuthorizationServerMetadataHandler(auth);
```

If the catch-all route does not receive the OpenID route:

```ts
// server/routes/auth/.well-known/openid-configuration.get.ts
import { createNitroOpenIDConfigurationMetadataHandler } from "@nk-sh/auth/nitro";
import { auth } from "../../../utils/auth";

export default createNitroOpenIDConfigurationMetadataHandler(auth);
```

## Vue

```ts
import { createApp } from "vue";
import { createAuthVuePlugin } from "@nk-sh/auth/vue";

const app = createApp(App);
const authVue = createAuthVuePlugin();

app.use(authVue);
await authVue.client.signIn.email({ email, password });
```

The client uses the same origin and `/auth` by default. It includes administration,
organizations, the OAuth provider client, usernames, JWT, 2FA, and passkeys.

It can be customized with `baseURL`, `basePath`, matching admin and organization
`accessControl`, additional plugins, and the `resolveBaseURL`, `transformPlugins`,
`transformOptions`, `onClientCreated`, and `onVueInstall` anchors.

## Emails

The verification, password recovery, and welcome templates are replaceable defaults:

```ts
const mailer = createResendAuthMailer({
    apiKey: config.resendApiKey,
    appName: config.appName,
    from: config.emailFrom,
    templates: {
        verification(branding, input) {
            return {
                subject: `Activate your ${branding.appName} account`,
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

## PostgreSQL and schema

The SQL migration is published inside the package, but it is never run automatically:

```bash
# Preview the migration plan without changing the database.
pnpm dlx @nk-sh/auth migrate --database-url "$DATABASE_URL" --dry-run

# Apply every pending migration in a transaction.
pnpm dlx @nk-sh/auth migrate --database-url "$DATABASE_URL"

# Inspect the installed schema version.
pnpm dlx @nk-sh/auth status --database-url "$DATABASE_URL"
```

When the package is already installed in a project, use `pnpm exec nk-auth` instead of
`pnpm dlx @nk-sh/auth`. The CLI validates that the URL uses PostgreSQL and never prints it.

```ts
import { applyAuthMigrations, getAuthSchemaVersion } from "@nk-sh/auth/postgres";

const currentVersion = await getAuthSchemaVersion(database);
const plan = await applyAuthMigrations(database, { dryRun: true });

await applyAuthMigrations(database);
```

## Extension

The runtime provides extension points before and after creating the Better Auth instance:

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

The `createNkAuth` preset also accepts `configure(defaults)` to modify its high-level
configuration.

The preset enables the complete built-in server set: OpenAPI, bearer sessions, admin,
organizations, usernames, JWT/JWKS, OAuth provider, 2FA, and passkeys. A consuming backend may use
only part of that surface without removing the other capabilities from the central auth service.
Dynamic organization roles are enabled with the built-in `owner`, `admin`, and `member` access
control definitions.

When onboarding separate APIs, use `oauthScopes` for their public scopes and
`oauthValidAudiences` for every accepted resource identifier. The authorization guide covers the
corresponding token and permission checks.

## Development and packaging

```bash
pnpm install
pnpm format
pnpm check
pnpm pack:dry-run
```

`oxfmt` applies the repository formatting rules. `oxlint` runs type-aware rules and TypeScript
diagnostics through `oxlint-tsgolint`. `tsc` remains part of the checks to validate declaration
generation and the public consumer contract.

The build uses `tsdown` to generate ESM, declarations, and source maps for every entry point. The
publishable result is validated with `publint`. `prepack` runs every check, so a clean clone
generates `dist` before creating or publishing the tarball.

`dist`, `node_modules`, tarballs, and local secrets remain ignored by Git. The library source
lives directly in `src` and must be versioned.

## License

MIT © Kevin Rojas
