import { createAuth } from "./create-auth.js";
import { createNodeScryptPasswordHasher } from "./password-node.js";
import { organizationAccessControl, organizationRoles } from "./roles.js";
import type {
    AuthDatabase,
    AuthMailer,
    AuthOptions,
    AuthRuntime,
    AuthSessionUser,
    OAuthProviderFeatureOptions,
    OrganizationFeatureOptions,
} from "./types.js";

export const NK_RESTRICTED_USERNAME_WORDS = [
    "admin",
    "administrator",
    "root",
    "support",
    "help",
    "info",
    "contact",
    "billing",
    "security",
    "sysadmin",
    "system",
] as const;

export interface NkAuthOptions {
    secret: string;
    baseURL: string;
    appName: string;
    database: AuthDatabase;
    mailer: AuthMailer;
    captchaSecretKey?: string;
    secureCookie?: boolean;
    trustedOrigins?: readonly string[];
    basePath?: string;
    cookieDomain?: string | false;
    loginPage?: string;
    consentPage?: string;
    oauthScopes?: OAuthProviderFeatureOptions["scopes"];
    oauthValidAudiences?: readonly string[];
    configure?(defaults: AuthOptions): AuthOptions;
}

export interface CreateNkUserInput {
    body: {
        email: string;
        password: string;
        name: string;
        role?: string | string[];
        data?: Record<string, unknown>;
    };
}

export interface SendNkVerificationEmailInput {
    body: {
        email: string;
        callbackURL?: string;
    };
}

export type NkAuthRuntime = Omit<AuthRuntime, "api"> & {
    api: AuthRuntime["api"] & {
        createUser(input: CreateNkUserInput): Promise<{
            user: AuthSessionUser;
        }>;
        sendVerificationEmail(input: SendNkVerificationEmailInput): Promise<unknown>;
    };
};

export function createNkAuth(options: NkAuthOptions): NkAuthRuntime {
    const defaults: AuthOptions = {
        secret: options.secret,
        baseURL: options.baseURL,
        basePath: options.basePath ?? "/auth",
        appName: options.appName,
        database: options.database,
        mailer: options.mailer,
        passwordHasher: createNodeScryptPasswordHasher(),
        trustedOrigins: options.trustedOrigins,
        normalizeEmail: true,
        usernamePolicy: {
            restrictedWords: NK_RESTRICTED_USERNAME_WORDS,
            match: "contains",
        },
        additionalUserFields: {
            phone: {
                type: "string",
                required: false,
            },
            plan: {
                type: "string",
                required: false,
            },
        },
        emailAndPassword: {
            enabled: true,
            autoSignIn: true,
            disableSignUp: true,
            requireEmailVerification: true,
            sendVerificationOnSignUp: true,
            sendWelcomeAfterVerification: true,
        },
        session: {
            storeSessionInDatabase: true,
            preserveSessionInDatabase: true,
            expiresIn: 60 * 60 * 24 * 31,
            cookieCache: {
                maxAge: 5 * 60,
            },
        },
        security: {
            ...(options.secureCookie === undefined
                ? {}
                : {
                      secure: options.secureCookie,
                      sameSite: options.secureCookie ? "none" : "lax",
                  }),
            disableOriginCheck: false,
            disableCSRFCheck: false,
            crossSubDomain: !options.cookieDomain ? false : { domain: options.cookieDomain },
        },
        features: {
            openAPI: { path: "/docs" },
            bearer: true,
            admin: true,
            organization: {
                allowUserToCreateOrganization: false,
                // Better Auth exposes OrganizationOptions with a non-generic AccessControl type,
                // while its own default access control retains narrower statement inference.
                ac: organizationAccessControl as NonNullable<OrganizationFeatureOptions["ac"]>,
                roles: organizationRoles,
                dynamicAccessControl: {
                    enabled: true,
                    maximumRolesPerOrganization: 25,
                },
            },
            username: true,
            jwt: true,
            oauthProvider: {
                loginPage: options.loginPage ?? "/sign-in",
                consentPage: options.consentPage ?? "/consent",
                allowDynamicClientRegistration: true,
                scopes: [
                    ...(options.oauthScopes ?? ["openid", "profile", "email", "offline_access"]),
                ],
                ...(options.oauthValidAudiences
                    ? { validAudiences: [...options.oauthValidAudiences] }
                    : {}),
            },
            twoFactor: true,
            passkey: true,
            captcha: options.captchaSecretKey
                ? {
                      provider: "cloudflare-turnstile",
                      secretKey: options.captchaSecretKey,
                  }
                : false,
        },
    };

    return createAuth(options.configure?.(defaults) ?? defaults) as NkAuthRuntime;
}
