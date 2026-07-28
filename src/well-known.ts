import {
    oauthProviderAuthServerMetadata,
    oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";

export interface OAuthAuthorizationServerMetadataRuntime {
    api: object;
}

export interface OpenIDConfigurationMetadataRuntime {
    api: object;
}

export interface WellKnownMetadataOptions {
    headers?: HeadersInit;
}

export interface AuthWellKnownPaths {
    /**
     * RFC 8414 allows both the issuer-appended path and the root-inserted alias.
     */
    oauthAuthorizationServer: readonly string[];
    /**
     * OpenID Connect discovery appends the well-known suffix to the issuer path.
     */
    openIDConfiguration: string;
}

function normalizeBasePath(basePath: string): string {
    const value = basePath.trim();
    if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
        throw new TypeError("basePath must be an absolute pathname without query or fragment");
    }

    const normalized = value.replace(/\/+/g, "/").replace(/\/$/, "");
    return normalized === "" ? "/" : normalized;
}

export function getAuthWellKnownPaths(basePath = "/auth"): AuthWellKnownPaths {
    const normalizedBasePath = normalizeBasePath(basePath);
    const issuerPath = normalizedBasePath === "/" ? "" : normalizedBasePath;

    return {
        oauthAuthorizationServer: [
            ...new Set([
                `${issuerPath}/.well-known/oauth-authorization-server`,
                `/.well-known/oauth-authorization-server${issuerPath}`,
            ]),
        ],
        openIDConfiguration: `${issuerPath}/.well-known/openid-configuration`,
    };
}

export function createOAuthAuthorizationServerMetadataHandler(
    auth: OAuthAuthorizationServerMetadataRuntime,
    options: WellKnownMetadataOptions = {},
) {
    assertMetadataMethod(auth, "getOAuthServerConfig");
    return oauthProviderAuthServerMetadata(
        auth as Parameters<typeof oauthProviderAuthServerMetadata>[0],
        options,
    );
}

export function createOpenIDConfigurationMetadataHandler(
    auth: OpenIDConfigurationMetadataRuntime,
    options: WellKnownMetadataOptions = {},
) {
    assertMetadataMethod(auth, "getOpenIdConfig");
    return oauthProviderOpenIdConfigMetadata(
        auth as Parameters<typeof oauthProviderOpenIdConfigMetadata>[0],
        options,
    );
}

function assertMetadataMethod(
    auth: OAuthAuthorizationServerMetadataRuntime | OpenIDConfigurationMetadataRuntime,
    method: "getOAuthServerConfig" | "getOpenIdConfig",
): void {
    const api = auth.api as Record<string, unknown>;
    if (typeof api[method] !== "function") {
        throw new Error(
            `${method} is unavailable. Enable features.oauthProvider before mounting its well-known handler.`,
        );
    }
}
