import { createHash, timingSafeEqual } from "node:crypto";
import {
    HTTPError,
    defineHandler,
    getValidatedQuery,
    getValidatedRouterParams,
    readValidatedBody,
    type H3Event,
    type Middleware,
} from "nitro/h3";
import { definePlugin } from "nitro";
import { z, type ZodType } from "zod";
import { hasRoles, type Role, type RoleMatchMode } from "./roles.js";
import type { AuthSession } from "./types.js";
import {
    createOAuthAuthorizationServerMetadataHandler,
    createOpenIDConfigurationMetadataHandler,
    type OAuthAuthorizationServerMetadataRuntime,
    type OpenIDConfigurationMetadataRuntime,
    type WellKnownMetadataOptions,
} from "./well-known.js";

export interface AuthHandlerRuntime {
    handler(request: Request): Promise<Response>;
}

export interface SessionAuthRuntime {
    api: {
        getSession(input: { headers: Headers }): Promise<unknown>;
    };
}

export function createAuthHandler(auth: AuthHandlerRuntime) {
    return defineHandler((event) => auth.handler(event.req));
}

export function createNitroOAuthAuthorizationServerMetadataHandler(
    auth: OAuthAuthorizationServerMetadataRuntime,
    options?: WellKnownMetadataOptions,
) {
    const handler = createOAuthAuthorizationServerMetadataHandler(auth, options);
    return defineHandler((event) => handler(event.req));
}

export function createNitroOpenIDConfigurationMetadataHandler(
    auth: OpenIDConfigurationMetadataRuntime,
    options?: WellKnownMetadataOptions,
) {
    const handler = createOpenIDConfigurationMetadataHandler(auth, options);
    return defineHandler((event) => handler(event.req));
}

export interface ClosableAuthRuntime {
    close(): Promise<void>;
}

export function createNitroAuthLifecyclePlugin(auth: ClosableAuthRuntime) {
    return definePlugin((nitro) => {
        nitro.hooks.hook("close", async () => {
            await auth.close();
        });
    });
}

export interface NitroCorsOptions {
    trustedOrigins: readonly string[];
    allowCredentials?: boolean;
    allowMethods?: readonly string[];
    allowHeaders?: readonly string[];
    allowNullOrigin?: boolean;
}

export function createNitroCorsMiddleware(options: NitroCorsOptions) {
    const trustedOrigins = new Set(options.trustedOrigins);
    const allowCredentials = options.allowCredentials ?? true;
    const allowMethods = options.allowMethods ?? [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ];
    const allowHeaders = options.allowHeaders ?? ["Content-Type", "Authorization"];

    return defineHandler((event) => {
        const setHeader = (name: string, value: string) => {
            event.res.headers.set(name, value);
            event.runtime?.node?.res?.setHeader(name, value);
        };

        const origin = event.req.headers.get("origin");
        const originAllowed =
            origin === null ||
            (origin === "null" && (options.allowNullOrigin ?? true)) ||
            (origin !== null && trustedOrigins.has(origin));

        setHeader("Access-Control-Allow-Credentials", allowCredentials ? "true" : "false");
        setHeader("Access-Control-Allow-Methods", allowMethods.join(","));
        setHeader("Access-Control-Allow-Headers", allowHeaders.join(", "));

        if (originAllowed && origin !== null) {
            setHeader("Access-Control-Allow-Origin", origin);
            setHeader("Vary", "Origin");
        }

        if (event.req.method === "OPTIONS") {
            event.res.status = 204;
            return "";
        }
        return;
    });
}

export interface ApiKeyGuardOptions {
    keys?: readonly string[];
    scheme?: string;
    verify?(apiKey: string, event: H3Event): boolean | Promise<boolean>;
}

function hashSecret(value: string): Buffer {
    return createHash("sha256").update(value).digest();
}

function secretsEqual(left: string, right: string): boolean {
    return timingSafeEqual(hashSecret(left), hashSecret(right));
}

export function createApiKeyGuard(options: ApiKeyGuardOptions) {
    const keys = options.keys ?? [];
    if (keys.length === 0 && !options.verify) {
        throw new Error("At least one API key or a verify callback is required");
    }

    return async (event: H3Event): Promise<void> => {
        const authorization = event.req.headers.get("authorization")?.trim();
        const [scheme, apiKey, ...extra] = authorization?.split(/\s+/) ?? [];
        const hasValidShape =
            scheme === (options.scheme ?? "Key") && Boolean(apiKey) && extra.length === 0;
        const verified =
            hasValidShape &&
            apiKey !== undefined &&
            (options.verify
                ? await options.verify(apiKey, event)
                : keys.some((key) => secretsEqual(apiKey, key)));

        if (!verified) {
            throw new HTTPError({
                statusCode: 401,
                statusMessage: "Unauthorized",
                cause: "Invalid API key",
                data: {
                    error: "UNAUTHORIZED_API_KEY",
                    type: "error",
                },
            });
        }
    };
}

export async function validateInput<T>(
    event: H3Event,
    schema: ZodType<T> | undefined,
    validator: (event: H3Event, validate: (input: unknown) => unknown) => Promise<unknown>,
    inputType: string,
): Promise<T | undefined> {
    if (!schema) return undefined;
    const result = (await validator(event, (input) =>
        schema.safeParse(input),
    )) as z.ZodSafeParseResult<T>;
    if (!result.success) {
        throw new HTTPError({
            statusCode: 422,
            statusMessage: "Unprocessable Entity",
            cause: `Invalid ${inputType}.`,
            data: {
                error: "BAD_REQUEST",
                type: "error",
                issues: result.error.issues,
            },
        });
    }
    return result.data;
}

export type ValidatedContext<TBody, TParams, TQuery> = {
    event: H3Event;
    body: TBody;
    params: TParams;
    query: TQuery;
};

export interface OpenAPIMetadata {
    summary?: string;
    tags?: string[];
    description?: string;
}

export type ValidatedHandlerOptions<TResponse, TBody, TParams, TQuery> = {
    body?: ZodType<TBody>;
    params?: ZodType<TParams>;
    query?: ZodType<TQuery>;
    response?: ZodType<TResponse>;
    openapi?: OpenAPIMetadata;
    middleware?: Middleware[];
    handler(context: ValidatedContext<TBody, TParams, TQuery>): TResponse | Promise<TResponse>;
};

async function readValidatedInputs<TBody, TParams, TQuery>(
    event: H3Event,
    options: {
        body?: ZodType<TBody>;
        params?: ZodType<TParams>;
        query?: ZodType<TQuery>;
    },
): Promise<[TBody, TParams, TQuery]> {
    const [body, params, query] = await Promise.all([
        validateInput(event, options.body, readValidatedBody, "body"),
        validateInput(event, options.params, getValidatedRouterParams, "params"),
        validateInput(event, options.query, getValidatedQuery, "query"),
    ]);
    return [body as TBody, params as TParams, query as TQuery];
}

function validateResponse<T>(schema: ZodType<T> | undefined, response: T): T {
    if (!schema) return response;
    const result = schema.safeParse(response);
    if (!result.success) {
        throw new HTTPError({
            statusCode: 500,
            statusMessage: "Invalid handler response",
            cause: "The handler response does not match its schema",
            data: {
                error: "INVALID_RESPONSE",
                type: "error",
            },
        });
    }
    return result.data;
}

export function defineValidatedHandler<
    TResponse = void,
    TBody = unknown,
    TParams = unknown,
    TQuery = unknown,
>(options: ValidatedHandlerOptions<TResponse, TBody, TParams, TQuery>) {
    return defineHandler({
        middleware: options.middleware,
        handler: async (event) => {
            const [body, params, query] = await readValidatedInputs(event, options);
            const response = await options.handler({
                event,
                body,
                params,
                query,
            });
            return validateResponse(options.response, response);
        },
    });
}

export type AuthenticatedContext<TBody, TParams, TQuery> = ValidatedContext<
    TBody,
    TParams,
    TQuery
> & {
    session: AuthSession;
};

export type AuthenticatedHandlerOptions<TResponse, TBody, TParams, TQuery> = Omit<
    ValidatedHandlerOptions<TResponse, TBody, TParams, TQuery>,
    "handler"
> & {
    auth: SessionAuthRuntime;
    roles: readonly Role[];
    roleMode?: RoleMatchMode;
    handler(context: AuthenticatedContext<TBody, TParams, TQuery>): TResponse | Promise<TResponse>;
};

export function defineAuthHandler<
    TResponse = void,
    TBody = unknown,
    TParams = unknown,
    TQuery = unknown,
>(options: AuthenticatedHandlerOptions<TResponse, TBody, TParams, TQuery>) {
    return defineHandler({
        middleware: options.middleware,
        handler: async (event) => {
            const session = (await options.auth.api.getSession({
                headers: event.req.headers,
            })) as AuthSession | null;

            if (!session) {
                throw new HTTPError({
                    statusCode: 401,
                    statusMessage: "Unauthorized",
                    cause: "No session found",
                    data: {
                        error: "UNAUTHORIZED_BY_SESSION",
                        type: "error",
                    },
                });
            }

            if (!hasRoles(session.user.role, options.roles, options.roleMode ?? "any")) {
                throw new HTTPError({
                    statusCode: 403,
                    statusMessage: "Forbidden",
                    cause: "User does not have the required roles",
                    data: {
                        error: "FORBIDDEN_BY_ROLES",
                        type: "error",
                    },
                });
            }

            const [body, params, query] = await readValidatedInputs(event, options);
            const response = await options.handler({
                session,
                event,
                body,
                params,
                query,
            });
            return validateResponse(options.response, response);
        },
    });
}
