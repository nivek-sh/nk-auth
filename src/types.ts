import type { Auth, BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import type {
    AdminOptions,
    BearerOptions,
    JwtOptions,
    OrganizationOptions,
    TwoFactorOptions,
    UsernameOptions,
} from "better-auth/plugins";
import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import type { PasskeyOptions } from "@better-auth/passkey";

export interface VerificationEmail {
    to: string;
    url: string;
    token: string;
    name?: string;
}

export interface PasswordResetEmail {
    to: string;
    url: string;
    token: string;
    name?: string;
}

export interface WelcomeEmail {
    to: string;
    name: string;
}

export interface AuthMailer {
    sendVerification(input: VerificationEmail): Promise<void>;
    sendPasswordReset(input: PasswordResetEmail): Promise<void>;
    sendWelcome?(input: WelcomeEmail): Promise<void>;
}

export interface PasswordHasher {
    hash(password: string): Promise<string>;
    verify(input: { hash: string; password: string }): Promise<boolean>;
}

export type BetterAuthDatabase = Exclude<BetterAuthOptions["database"], undefined>;

export interface AuthDatabase {
    configuration: BetterAuthDatabase;
    close?(): Promise<void>;
}

export interface EmailPasswordOptions {
    enabled?: boolean;
    disableSignUp?: boolean;
    autoSignIn?: boolean;
    minPasswordLength?: number;
    maxPasswordLength?: number;
    requireEmailVerification?: boolean;
    sendVerificationOnSignUp?: boolean;
    sendWelcomeAfterVerification?: boolean;
}

export interface SessionOptions {
    expiresIn?: number;
    storeSessionInDatabase?: boolean;
    preserveSessionInDatabase?: boolean;
    cookieCache?: false | { maxAge: number };
}

export interface CookieSecurityOptions {
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    crossSubDomain?: false | { domain: string };
    disableOriginCheck?: boolean;
    disableCSRFCheck?: boolean;
}

export interface UsernamePolicy {
    restrictedWords?: readonly string[];
    match?: "contains" | "exact";
    validate?(username: string): string | undefined | Promise<string | undefined>;
}

export type AdminFeatureOptions = Omit<AdminOptions, "schema">;
export type OrganizationFeatureOptions = Omit<OrganizationOptions, "schema" | "teams">;
export type JwtFeatureOptions = Omit<JwtOptions, "schema">;
export type BearerFeatureOptions = BearerOptions;
export type UsernameFeatureOptions = Omit<UsernameOptions, "schema">;
export type TwoFactorFeatureOptions = Omit<TwoFactorOptions, "schema">;
export type PasskeyFeatureOptions = Omit<PasskeyOptions, "schema">;
export type OAuthProviderFeatureOptions = Omit<OAuthOptions<Scope[]>, "schema" | "scopes"> & {
    scopes?: readonly Scope[];
};

export interface CaptchaFeatureOptions {
    provider: "cloudflare-turnstile";
    secretKey: string;
}

export interface AuthFeatures {
    openAPI?: boolean | { path?: string };
    bearer?: boolean | BearerFeatureOptions;
    admin?: boolean | AdminFeatureOptions;
    organization?: boolean | OrganizationFeatureOptions;
    username?: boolean | UsernameFeatureOptions;
    jwt?: boolean | JwtFeatureOptions;
    oauthProvider?: false | OAuthProviderFeatureOptions;
    twoFactor?: boolean | TwoFactorFeatureOptions;
    passkey?: boolean | PasskeyFeatureOptions;
    captcha?: false | CaptchaFeatureOptions;
}

type UserConfiguration = NonNullable<BetterAuthOptions["user"]>;

export interface AuthServerAnchors {
    transformPlugins?(plugins: readonly BetterAuthPlugin[]): readonly BetterAuthPlugin[];
    transformOptions?(options: BetterAuthOptions): BetterAuthOptions;
    onRuntimeCreated?(runtime: AuthRuntime): void;
}

export interface AuthOptions {
    secret: string;
    baseURL: string;
    appName: string;
    database: AuthDatabase;
    basePath?: string;
    trustedOrigins?: readonly string[];
    disabledPaths?: readonly string[];
    mailer?: AuthMailer;
    passwordHasher?: PasswordHasher;
    emailAndPassword?: false | EmailPasswordOptions;
    session?: SessionOptions;
    security?: CookieSecurityOptions;
    usernamePolicy?: UsernamePolicy;
    normalizeEmail?: boolean;
    additionalUserFields?: UserConfiguration["additionalFields"];
    features?: AuthFeatures;
    plugins?: readonly BetterAuthPlugin[];
    anchors?: AuthServerAnchors;
}

export interface AuthSessionUser {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null;
    role?: string | null;
    phone?: string | null;
    plan?: string | null;
    username?: string | null;
    displayUsername?: string | null;
    twoFactorEnabled?: boolean | null;
    [key: string]: unknown;
}

export interface AuthSessionData {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    [key: string]: unknown;
}

export interface AuthSession {
    user: AuthSessionUser;
    session: AuthSessionData;
}

export type AuthRuntime = Auth & {
    readonly betterAuth: Auth;
    close(): Promise<void>;
};
