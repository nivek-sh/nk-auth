import { APIError, betterAuth } from "better-auth";
import type { Auth, BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import {
    admin,
    bearer,
    captcha,
    jwt,
    openAPI,
    organization,
    twoFactor,
    username,
} from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { accessControl, roles } from "./roles.js";
import {
    adminSchema,
    coreSchema,
    jwtSchema,
    oauthSchema,
    organizationSchema,
    passkeySchema,
    twoFactorSchema,
    usernameSchema,
} from "./schema-mappings.js";
import type { AuthOptions, AuthRuntime, EmailPasswordOptions, UsernamePolicy } from "./types.js";

const DEFAULT_EMAIL_PASSWORD: Required<EmailPasswordOptions> = {
    enabled: true,
    disableSignUp: false,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    sendVerificationOnSignUp: true,
    sendWelcomeAfterVerification: true,
};

function mergeEmailPasswordOptions(
    input: AuthOptions["emailAndPassword"],
): Required<EmailPasswordOptions> | undefined {
    if (input === false) return undefined;
    return {
        ...DEFAULT_EMAIL_PASSWORD,
        ...input,
    };
}

async function validateUsername(
    usernameValue: unknown,
    policy: UsernamePolicy | undefined,
): Promise<void> {
    if (typeof usernameValue !== "string" || !policy) return;

    const username = usernameValue.toLowerCase();
    const match = policy.match ?? "contains";
    const restrictedWord = policy.restrictedWords?.find((word) => {
        const candidate = word.toLowerCase();
        return match === "exact" ? username === candidate : username.includes(candidate);
    });

    if (restrictedWord) {
        throw new APIError("BAD_REQUEST", {
            message: "This username contains a restricted word.",
        });
    }

    const customError = await policy.validate?.(usernameValue);
    if (customError) {
        throw new APIError("BAD_REQUEST", { message: customError });
    }
}

function createPlugins(options: AuthOptions): BetterAuthPlugin[] {
    const features = options.features ?? {};
    const oauthProviderEnabled = Boolean(features.oauthProvider);
    const plugins: BetterAuthPlugin[] = [];

    if (features.openAPI) {
        const openAPIOptions = typeof features.openAPI === "object" ? features.openAPI : {};
        plugins.push(openAPI({ path: openAPIOptions.path ?? "/docs" }));
    }

    if (features.bearer) {
        const bearerOptions = typeof features.bearer === "object" ? features.bearer : {};
        plugins.push(bearer(bearerOptions));
    }

    if (features.admin) {
        const adminOptions = typeof features.admin === "object" ? features.admin : {};
        if ((adminOptions.ac === undefined) !== (adminOptions.roles === undefined)) {
            throw new Error(
                "features.admin.ac and features.admin.roles must be configured together",
            );
        }

        plugins.push(
            admin({
                ...adminOptions,
                ac: adminOptions.ac ?? accessControl,
                defaultRole: adminOptions.defaultRole ?? "user",
                adminRoles: adminOptions.adminRoles ?? ["admin", "moderator"],
                roles: adminOptions.roles ?? roles,
                schema: adminSchema,
            }),
        );
    }

    if (features.organization) {
        const organizationOptions =
            typeof features.organization === "object" ? features.organization : {};

        plugins.push(
            organization({
                ...organizationOptions,
                allowUserToCreateOrganization:
                    organizationOptions.allowUserToCreateOrganization ?? false,
                schema: organizationSchema,
            }),
        );
    }

    if (features.username) {
        const usernameOptions = typeof features.username === "object" ? features.username : {};
        plugins.push(username({ ...usernameOptions, schema: usernameSchema }));
    }

    if (features.jwt) {
        const jwtOptions = typeof features.jwt === "object" ? features.jwt : {};
        plugins.push(
            jwt({
                ...jwtOptions,
                disableSettingJwtHeader: jwtOptions.disableSettingJwtHeader ?? oauthProviderEnabled,
                schema: jwtSchema,
            }),
        );
    }

    if (features.oauthProvider) {
        plugins.push(
            oauthProvider({
                ...features.oauthProvider,
                allowDynamicClientRegistration:
                    features.oauthProvider.allowDynamicClientRegistration ?? false,
                scopes: [...(features.oauthProvider.scopes ?? ["openid", "profile", "email"])],
                schema: oauthSchema,
            }),
        );
    }

    if (features.twoFactor) {
        const twoFactorOptions = typeof features.twoFactor === "object" ? features.twoFactor : {};
        plugins.push(twoFactor({ ...twoFactorOptions, schema: twoFactorSchema }));
    }

    if (features.passkey) {
        const passkeyOptions = typeof features.passkey === "object" ? features.passkey : {};
        plugins.push(passkey({ ...passkeyOptions, schema: passkeySchema }));
    }

    if (features.captcha) {
        plugins.push(
            captcha({
                provider: features.captcha.provider,
                secretKey: features.captcha.secretKey,
            }),
        );
    }

    plugins.push(...(options.plugins ?? []));
    const finalPlugins = [...(options.anchors?.transformPlugins?.(plugins) ?? plugins)];
    if (
        features.oauthProvider &&
        features.oauthProvider.disableJwtPlugin !== true &&
        !finalPlugins.some((plugin) => plugin.id === "jwt")
    ) {
        throw new Error(
            "features.oauthProvider requires features.jwt unless disableJwtPlugin is true",
        );
    }
    return finalPlugins;
}

export function createAuth(options: AuthOptions): AuthRuntime {
    const emailPassword = mergeEmailPasswordOptions(options.emailAndPassword);
    if (emailPassword?.enabled && emailPassword.requireEmailVerification && !options.mailer) {
        throw new Error("mailer is required when email verification is enabled");
    }

    const secureCookies =
        options.security?.secure ?? new URL(options.baseURL).protocol === "https:";
    const plugins = createPlugins(options);
    const disabledPaths = new Set(options.disabledPaths ?? []);
    if (options.features?.oauthProvider) disabledPaths.add("/token");

    const config: BetterAuthOptions = {
        secret: options.secret,
        baseURL: options.baseURL,
        basePath: options.basePath ?? "/auth",
        appName: options.appName,
        database: options.database.configuration,
        trustedOrigins: [...new Set([options.baseURL, ...(options.trustedOrigins ?? [])])],
        disabledPaths: [...disabledPaths],
        databaseHooks: {
            user: {
                create: {
                    async before(user) {
                        await validateUsername(user.username, options.usernamePolicy);
                        return {
                            data: {
                                ...user,
                                email:
                                    options.normalizeEmail === false
                                        ? user.email
                                        : user.email?.toLowerCase(),
                            },
                        };
                    },
                },
                update: {
                    async before(user) {
                        await validateUsername(user.username, options.usernamePolicy);
                        return {
                            data: {
                                ...user,
                                email:
                                    options.normalizeEmail === false
                                        ? user.email
                                        : user.email?.toLowerCase(),
                            },
                        };
                    },
                },
            },
        },
        advanced: {
            useSecureCookies: secureCookies,
            defaultCookieAttributes: {
                secure: secureCookies,
                sameSite: options.security?.sameSite ?? (secureCookies ? "none" : "lax"),
                httpOnly: true,
            },
            disableOriginCheck: options.security?.disableOriginCheck ?? false,
            disableCSRFCheck: options.security?.disableCSRFCheck ?? false,
            ...(options.security?.crossSubDomain
                ? {
                      crossSubDomainCookies: {
                          enabled: true,
                          domain: options.security.crossSubDomain.domain,
                      },
                  }
                : {}),
        },
        user: {
            ...coreSchema.user,
            additionalFields: options.additionalUserFields,
        },
        session: {
            ...coreSchema.session,
            storeSessionInDatabase: options.session?.storeSessionInDatabase ?? true,
            preserveSessionInDatabase: options.session?.preserveSessionInDatabase ?? true,
            expiresIn: options.session?.expiresIn ?? 60 * 60 * 24 * 30,
            cookieCache:
                options.session?.cookieCache === false
                    ? { enabled: false }
                    : {
                          enabled: true,
                          maxAge: options.session?.cookieCache?.maxAge ?? 5 * 60,
                      },
        },
        account: coreSchema.account,
        verification: coreSchema.verification,
        plugins,
    };

    if (emailPassword) {
        config.emailAndPassword = {
            enabled: emailPassword.enabled,
            autoSignIn: emailPassword.autoSignIn,
            disableSignUp: emailPassword.disableSignUp,
            minPasswordLength: emailPassword.minPasswordLength,
            maxPasswordLength: emailPassword.maxPasswordLength,
            requireEmailVerification: emailPassword.requireEmailVerification,
            ...(options.mailer
                ? {
                      sendResetPassword: async ({ user, url, token }) => {
                          await options.mailer?.sendPasswordReset({
                              to: user.email,
                              name: user.name,
                              url,
                              token,
                          });
                      },
                  }
                : {}),
            ...(options.passwordHasher
                ? {
                      password: {
                          hash: (password) => options.passwordHasher!.hash(password),
                          verify: (input) => options.passwordHasher!.verify(input),
                      },
                  }
                : {}),
        };

        if (options.mailer) {
            config.emailVerification = {
                sendVerificationEmail: async ({ user, url, token }) => {
                    await options.mailer?.sendVerification({
                        to: user.email,
                        name: user.name,
                        url,
                        token,
                    });
                },
                afterEmailVerification: async (user) => {
                    if (emailPassword.sendWelcomeAfterVerification && options.mailer?.sendWelcome) {
                        await options.mailer.sendWelcome({
                            to: user.email,
                            name: user.name,
                        });
                    }
                },
                sendOnSignUp: emailPassword.sendVerificationOnSignUp,
            };
        }
    }

    const finalConfig = options.anchors?.transformOptions?.(config) ?? config;
    const instance = betterAuth(finalConfig) as Auth;
    let closed = false;

    const runtime = Object.assign(instance, {
        betterAuth: instance,
        async close() {
            if (closed) return;
            closed = true;
            await options.database.close?.();
        },
    });
    options.anchors?.onRuntimeCreated?.(runtime);
    return runtime;
}
