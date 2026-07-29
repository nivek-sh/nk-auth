import type { JWTPayload } from "better-auth";
import { verifyAccessToken } from "better-auth/oauth2";

type NativeAccessTokenOptions = Parameters<typeof verifyAccessToken>[1];
type NativeJWTVerifyOptions = NativeAccessTokenOptions["verifyOptions"];

export interface AccessTokenRemoteVerification {
    introspectURL: string;
    clientId: string;
    clientSecret: string;
    force?: boolean;
}

export interface AccessTokenVerifierOptions {
    issuer: string | readonly string[];
    audience: string | readonly string[];
    jwksURL?: string;
    scopes?: readonly string[];
    remoteVerification?: AccessTokenRemoteVerification;
    verification?: Omit<NativeJWTVerifyOptions, "audience" | "issuer">;
}

export interface AccessTokenRequirements {
    scopes?: readonly string[];
}

export interface AccessTokenVerifier {
    verify(token: string, requirements?: AccessTokenRequirements): Promise<JWTPayload>;
    verifyRequest(
        requestOrHeaders: Request | Headers,
        requirements?: AccessTokenRequirements,
    ): Promise<JWTPayload>;
}

export type AccessTokenAuthenticationErrorCode =
    | "MISSING_ACCESS_TOKEN"
    | "INVALID_ACCESS_TOKEN"
    | "MISSING_TOKEN_SUBJECT";

export class AccessTokenAuthenticationError extends Error {
    readonly code: AccessTokenAuthenticationErrorCode;

    constructor(code: AccessTokenAuthenticationErrorCode, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "AccessTokenAuthenticationError";
        this.code = code;
    }
}

export function getBearerAccessToken(requestOrHeaders: Request | Headers): string | undefined {
    const headers =
        requestOrHeaders instanceof Headers ? requestOrHeaders : requestOrHeaders.headers;
    const authorization = headers.get("authorization")?.trim();
    const match = authorization?.match(/^Bearer[ \t]+([^\s]+)$/i);
    return match?.[1];
}

export function getAccessTokenSubject(payload: JWTPayload): string {
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new AccessTokenAuthenticationError(
            "MISSING_TOKEN_SUBJECT",
            "The access token does not contain a subject",
        );
    }
    return payload.sub;
}

/**
 * Creates a resource-server verifier for tokens issued by the separate auth
 * service. JWTs are verified locally through JWKS unless remote introspection
 * is explicitly configured or forced.
 */
export function createAccessTokenVerifier(
    options: AccessTokenVerifierOptions,
): AccessTokenVerifier {
    if (!options.jwksURL && !options.remoteVerification) {
        throw new Error("jwksURL or remoteVerification is required");
    }

    const baseScopes = [...new Set(options.scopes ?? [])];
    const issuer = typeof options.issuer === "string" ? options.issuer : [...options.issuer];
    const audience =
        typeof options.audience === "string" ? options.audience : [...options.audience];
    const remoteVerify = options.remoteVerification
        ? {
              introspectUrl: options.remoteVerification.introspectURL,
              clientId: options.remoteVerification.clientId,
              clientSecret: options.remoteVerification.clientSecret,
              force: options.remoteVerification.force,
          }
        : undefined;

    const verifier: AccessTokenVerifier = {
        async verify(token, requirements) {
            const scopes = [...new Set([...baseScopes, ...(requirements?.scopes ?? [])])];
            try {
                return await verifyAccessToken(token, {
                    verifyOptions: {
                        ...options.verification,
                        issuer,
                        audience,
                    },
                    ...(options.jwksURL ? { jwksUrl: options.jwksURL } : {}),
                    ...(scopes.length > 0 ? { scopes } : {}),
                    ...(remoteVerify ? { remoteVerify } : {}),
                });
            } catch (cause) {
                throw new AccessTokenAuthenticationError(
                    "INVALID_ACCESS_TOKEN",
                    "The access token could not be verified",
                    { cause },
                );
            }
        },
        async verifyRequest(requestOrHeaders, requirements) {
            const token = getBearerAccessToken(requestOrHeaders);
            if (!token) {
                throw new AccessTokenAuthenticationError(
                    "MISSING_ACCESS_TOKEN",
                    "A Bearer access token is required",
                );
            }
            return verifier.verify(token, requirements);
        },
    };

    return verifier;
}
