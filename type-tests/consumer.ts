import {
    createAuth,
    createOAuthAuthorizationServerMetadataHandler,
    createOpenIDConfigurationMetadataHandler,
    getAuthWellKnownPaths,
    hasRoles,
    type AuthDatabase,
    type AuthMailer,
    type AuthOptions,
} from "@nk-sh/auth";
import {
    createApiKeyGuard,
    createAuthHandler,
    createNitroOAuthAuthorizationServerMetadataHandler,
    createNitroOpenIDConfigurationMetadataHandler,
} from "@nk-sh/auth/nitro";
import { createNodeScryptPasswordHasher } from "@nk-sh/auth/password/node";
import { applyAuthMigrations, createPostgresAuthDatabase } from "@nk-sh/auth/postgres";
import { createNkAuth, type NkAuthOptions } from "@nk-sh/auth/presets/nk";
import { createResendAuthMailer } from "@nk-sh/auth/resend";
import { authSchemaVersion, getInitialAuthSchemaURL } from "@nk-sh/auth/schema";
import {
    createAuthVueClient,
    createAuthVuePlugin,
    createBetterAuthVueClient,
    useAuthClient,
} from "@nk-sh/auth/vue";

declare const database: AuthDatabase;
declare const mailer: AuthMailer;

const options: AuthOptions = {
    secret: "consumer-type-test-secret-value",
    baseURL: "https://auth.example.com",
    appName: "Example",
    database,
    mailer,
    passwordHasher: createNodeScryptPasswordHasher(),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
    },
    features: {
        bearer: true,
        jwt: true,
    },
    anchors: {
        transformPlugins(defaultPlugins) {
            return defaultPlugins;
        },
        transformOptions(defaultOptions) {
            return defaultOptions;
        },
        onRuntimeCreated(runtime) {
            void runtime.handler;
        },
    },
};

const auth = createAuth(options);
const handler = createAuthHandler(auth);
const authorizationMetadata = createOAuthAuthorizationServerMetadataHandler(auth);
const openIDMetadata = createOpenIDConfigurationMetadataHandler(auth);
const nitroAuthorizationMetadata = createNitroOAuthAuthorizationServerMetadataHandler(auth);
const nitroOpenIDMetadata = createNitroOpenIDConfigurationMetadataHandler(auth);
const guard = createApiKeyGuard({ keys: ["secret"] });
const client = createAuthVueClient({
    baseURL: "https://auth.example.com",
    basePath: "/auth",
    anchors: {
        transformPlugins(defaultPlugins) {
            return defaultPlugins;
        },
        transformOptions(defaultOptions) {
            return {
                ...defaultOptions,
                fetchOptions: {
                    ...defaultOptions.fetchOptions,
                    credentials: "include",
                },
            };
        },
    },
});
const vuePlugin = createAuthVuePlugin();
const nativeClient = createBetterAuthVueClient({
    baseURL: "https://auth.example.com",
    basePath: "/auth",
});
const postgres = createPostgresAuthDatabase({
    url: "postgres://localhost/example",
});
const resend = createResendAuthMailer({
    apiKey: "test",
    appName: "Example",
    from: "auth@example.com",
    templates: {
        verification(branding, input) {
            return {
                subject: `Verify ${branding.appName}`,
                html: `<a href="${input.url}">Verify</a>`,
            };
        },
    },
    hooks: {
        transformMessage(_kind, message) {
            return message;
        },
    },
});
const presetOptions: NkAuthOptions = {
    secret: "consumer-type-test-secret-value",
    baseURL: "https://auth.example.com",
    appName: "Example",
    database,
    mailer,
    captchaSecretKey: "captcha",
    secureCookie: true,
    configure(defaults) {
        return {
            ...defaults,
            session: {
                ...defaults.session,
                expiresIn: 60 * 60,
            },
        };
    },
};
const preset = createNkAuth(presetOptions);

void auth.handler;
void handler;
void authorizationMetadata;
void openIDMetadata;
void nitroAuthorizationMetadata;
void nitroOpenIDMetadata;
void getAuthWellKnownPaths("/auth");
void guard;
void client.signIn;
void client.admin.createUser;
void client.passkey.addPasskey;
void client.twoFactor.enable;
void vuePlugin.client.useSession;
void nativeClient.useSession;
void useAuthClient;
void applyAuthMigrations(postgres, { dryRun: true });
void resend.sendVerification;
void preset.api.createUser;
void authSchemaVersion;
void getInitialAuthSchemaURL();
void hasRoles("admin", ["admin"]);
