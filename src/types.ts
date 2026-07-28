import type { Auth, BetterAuthOptions, BetterAuthPlugin } from "better-auth";

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

export interface OrganizationFeatureOptions {
    allowUserToCreateOrganization?: boolean | ((user: unknown) => boolean | Promise<boolean>);
}

export interface OAuthProviderFeatureOptions {
    loginPage: string;
    consentPage: string;
    allowDynamicClientRegistration?: boolean;
    scopes?: readonly string[];
}

export interface CaptchaFeatureOptions {
    provider: "cloudflare-turnstile";
    secretKey: string;
}

export interface AuthFeatures {
    openAPI?: boolean | { path?: string };
    bearer?: boolean;
    admin?: boolean;
    organization?: boolean | OrganizationFeatureOptions;
    username?: boolean;
    jwt?: boolean;
    oauthProvider?: false | OAuthProviderFeatureOptions;
    twoFactor?: boolean;
    passkey?: boolean;
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
