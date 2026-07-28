import { Resend } from "resend";
import type { AuthMailer, PasswordResetEmail, VerificationEmail, WelcomeEmail } from "./types.js";

export interface AuthEmailBranding {
    appName: string;
    from: string;
    dashboardURL?: string;
}

export interface AuthEmailMessage {
    subject: string;
    html: string;
}

export type AuthEmailKind = "verification" | "passwordReset" | "welcome";
export type AuthEmailInput = VerificationEmail | PasswordResetEmail | WelcomeEmail;

export interface AuthEmailTemplates {
    verification(
        branding: AuthEmailBranding,
        input: VerificationEmail,
    ): AuthEmailMessage | Promise<AuthEmailMessage>;
    passwordReset(
        branding: AuthEmailBranding,
        input: PasswordResetEmail,
    ): AuthEmailMessage | Promise<AuthEmailMessage>;
    welcome(
        branding: AuthEmailBranding,
        input: WelcomeEmail,
    ): AuthEmailMessage | Promise<AuthEmailMessage>;
}

export interface ResendAuthMailerHooks {
    transformMessage?(
        kind: AuthEmailKind,
        message: AuthEmailMessage,
        input: AuthEmailInput,
    ): AuthEmailMessage | Promise<AuthEmailMessage>;
    onSent?(
        kind: AuthEmailKind,
        input: AuthEmailInput,
        message: AuthEmailMessage,
    ): void | Promise<void>;
}

export interface ResendAuthMailerOptions extends AuthEmailBranding {
    apiKey?: string;
    client?: Resend;
    templates?: Partial<AuthEmailTemplates>;
    hooks?: ResendAuthMailerHooks;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function emailLayout(input: { appName: string; title: string; content: string }): string {
    const appName = escapeHtml(input.appName);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:40px 0">
    <tr><td align="center">
      <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#18181b;padding:32px 40px;text-align:center;color:#fff;font-size:20px;font-weight:600">${appName}</td></tr>
        <tr><td style="padding:40px">${input.content}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function actionButton(label: string, url: string): string {
    const safeURL = escapeHtml(url);
    return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px">
  <tr><td style="border-radius:8px;background:#18181b">
    <a href="${safeURL}" target="_blank" rel="noreferrer" style="display:inline-block;padding:12px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(label)}</a>
  </td></tr>
</table>
<p style="color:#71717a;font-size:13px;line-height:1.5">If the button does not work, copy this URL:</p>
<p style="color:#2563eb;font-size:13px;line-height:1.5;word-break:break-all">${safeURL}</p>`;
}

export function renderVerificationEmail(
    branding: AuthEmailBranding,
    input: VerificationEmail,
): string {
    return emailLayout({
        appName: branding.appName,
        title: "Verify your email",
        content: `<h1 style="color:#18181b;font-size:22px">Verify your email address</h1>
<p style="color:#52525b;font-size:15px;line-height:1.6">Verify your email address to activate your account.</p>
${actionButton("Verify Email", input.url)}
<p style="color:#a1a1aa;font-size:12px">If you did not create an account, you can ignore this email.</p>`,
    });
}

export function renderPasswordResetEmail(
    branding: AuthEmailBranding,
    input: PasswordResetEmail,
): string {
    return emailLayout({
        appName: branding.appName,
        title: "Reset your password",
        content: `<h1 style="color:#18181b;font-size:22px">Reset your password</h1>
<p style="color:#52525b;font-size:15px;line-height:1.6">We received a request to reset your password.</p>
${actionButton("Reset Password", input.url)}
<p style="color:#a1a1aa;font-size:12px">If you did not request a reset, you can ignore this email.</p>`,
    });
}

export function renderWelcomeEmail(branding: AuthEmailBranding, input: WelcomeEmail): string {
    const firstName = escapeHtml(input.name.split(" ")[0] || input.name);
    const dashboardAction = branding.dashboardURL
        ? actionButton("Go to Dashboard", branding.dashboardURL)
        : "";

    return emailLayout({
        appName: branding.appName,
        title: `Welcome to ${branding.appName}`,
        content: `<h1 style="color:#18181b;font-size:22px">Email verified successfully</h1>
<p style="color:#52525b;font-size:15px;line-height:1.6">Hi ${firstName}, your account is now active.</p>
${dashboardAction}`,
    });
}

function renderDefaultVerificationMessage(
    branding: AuthEmailBranding,
    input: VerificationEmail,
): AuthEmailMessage {
    return {
        subject: `Verify your email — ${branding.appName}`,
        html: renderVerificationEmail(branding, input),
    };
}

function renderDefaultPasswordResetMessage(
    branding: AuthEmailBranding,
    input: PasswordResetEmail,
): AuthEmailMessage {
    return {
        subject: `Reset your password — ${branding.appName}`,
        html: renderPasswordResetEmail(branding, input),
    };
}

function renderDefaultWelcomeMessage(
    branding: AuthEmailBranding,
    input: WelcomeEmail,
): AuthEmailMessage {
    return {
        subject: `Welcome to ${branding.appName}!`,
        html: renderWelcomeEmail(branding, input),
    };
}

export function createResendAuthMailer(options: ResendAuthMailerOptions): AuthMailer {
    if (!options.client && !options.apiKey) {
        throw new Error("apiKey or client is required to create the Resend mailer");
    }

    const client = options.client ?? new Resend(options.apiKey);
    const branding: AuthEmailBranding = {
        appName: options.appName,
        from: options.from,
        dashboardURL: options.dashboardURL,
    };

    async function send(
        kind: AuthEmailKind,
        input: AuthEmailInput,
        message: AuthEmailMessage,
    ): Promise<void> {
        const finalMessage =
            (await options.hooks?.transformMessage?.(kind, message, input)) ?? message;
        const result = await client.emails.send({
            from: options.from,
            to: input.to,
            subject: finalMessage.subject,
            html: finalMessage.html,
        });
        if (result.error) {
            throw new Error(`Resend failed: ${result.error.message}`);
        }
        await options.hooks?.onSent?.(kind, input, finalMessage);
    }

    return {
        async sendVerification(input) {
            const message =
                (await options.templates?.verification?.(branding, input)) ??
                renderDefaultVerificationMessage(branding, input);
            await send("verification", input, message);
        },
        async sendPasswordReset(input) {
            const message =
                (await options.templates?.passwordReset?.(branding, input)) ??
                renderDefaultPasswordResetMessage(branding, input);
            await send("passwordReset", input, message);
        },
        async sendWelcome(input) {
            const message =
                (await options.templates?.welcome?.(branding, input)) ??
                renderDefaultWelcomeMessage(branding, input);
            await send("welcome", input, message);
        },
    };
}
