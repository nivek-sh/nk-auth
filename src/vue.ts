import type { BetterAuthClientOptions, BetterAuthClientPlugin } from "better-auth";
import {
    adminClient,
    jwtClient,
    organizationClient,
    twoFactorClient,
    usernameClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/vue";
import { inject, type App, type InjectionKey, type Plugin } from "vue";

function createDefaultPlugins() {
    return [
        adminClient(),
        organizationClient(),
        usernameClient(),
        jwtClient(),
        twoFactorClient(),
        passkeyClient(),
    ];
}

type DefaultPlugins = ReturnType<typeof createDefaultPlugins>;
type DefaultClientOptions = Omit<BetterAuthClientOptions, "plugins"> & {
    plugins: DefaultPlugins;
};

export type AuthVueClient = ReturnType<typeof createAuthClient<DefaultClientOptions>>;

export interface AuthVueClientAnchors {
    /**
     * Resolve the auth origin at runtime. Return `undefined` for same-origin.
     */
    resolveBaseURL?(configuredBaseURL: string | undefined): string | undefined;
    /**
     * Append, replace or reorder the built-in Better Auth client plugins.
     */
    transformPlugins?(
        defaultPlugins: readonly BetterAuthClientPlugin[],
    ): readonly BetterAuthClientPlugin[];
    /**
     * Last chance to modify native Better Auth client options.
     */
    transformOptions?(options: BetterAuthClientOptions): BetterAuthClientOptions;
    onClientCreated?(client: AuthVueClient): void;
    onVueInstall?(app: App, client: AuthVueClient): void;
}

export interface AuthVueClientOptions extends Omit<BetterAuthClientOptions, "plugins"> {
    /**
     * Defaults to same-origin. Use `basePath` when only the path differs.
     */
    baseURL?: string;
    /**
     * The default server base path is `/auth`.
     */
    basePath?: string;
    /**
     * Extra Better Auth plugins appended after the built-in plugin set.
     */
    plugins?: readonly BetterAuthClientPlugin[];
    anchors?: AuthVueClientAnchors;
}

export function createAuthVueClient(options: AuthVueClientOptions = {}): AuthVueClient {
    const {
        anchors,
        plugins: extraPlugins = [],
        baseURL: configuredBaseURL,
        basePath = "/auth",
        ...nativeOptions
    } = options;

    const defaultPlugins: readonly BetterAuthClientPlugin[] = [
        ...createDefaultPlugins(),
        ...extraPlugins,
    ];
    const plugins = anchors?.transformPlugins?.(defaultPlugins) ?? defaultPlugins;
    const baseURL = anchors?.resolveBaseURL?.(configuredBaseURL) ?? configuredBaseURL;

    const initialOptions: BetterAuthClientOptions = {
        ...nativeOptions,
        ...(baseURL ? { baseURL } : {}),
        basePath,
        plugins: [...plugins],
    };
    const finalOptions = anchors?.transformOptions?.(initialOptions) ?? initialOptions;
    const client = createAuthClient(finalOptions as DefaultClientOptions) as AuthVueClient;

    anchors?.onClientCreated?.(client);
    return client;
}

export const AUTH_VUE_CLIENT_KEY: InjectionKey<AuthVueClient> = Symbol("@nk-sh/auth/vue");

export interface AuthVuePluginOptions extends AuthVueClientOptions {
    injectionKey?: InjectionKey<AuthVueClient>;
    /**
     * Set a Vue global property such as `$auth`. Disabled by default.
     */
    globalProperty?: string | false;
}

export type AuthVuePlugin = Plugin & {
    readonly client: AuthVueClient;
    readonly injectionKey: InjectionKey<AuthVueClient>;
};

export function createAuthVuePlugin(options: AuthVuePluginOptions = {}): AuthVuePlugin {
    const {
        injectionKey = AUTH_VUE_CLIENT_KEY,
        globalProperty = false,
        ...clientOptions
    } = options;
    const client = createAuthVueClient(clientOptions);

    return {
        client,
        injectionKey,
        install(app) {
            app.provide(injectionKey, client);
            if (globalProperty) {
                app.config.globalProperties[globalProperty] = client;
            }
            options.anchors?.onVueInstall?.(app, client);
        },
    };
}

export function useAuthClient(
    injectionKey: InjectionKey<AuthVueClient> = AUTH_VUE_CLIENT_KEY,
): AuthVueClient {
    const client = inject(injectionKey);
    if (!client) {
        throw new Error("Auth client is not installed. Call app.use(createAuthVuePlugin()).");
    }
    return client;
}

/**
 * Escape hatch with Better Auth's native generic type inference.
 */
export { createAuthClient as createBetterAuthVueClient };
