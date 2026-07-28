import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
    createAuth,
    createOAuthAuthorizationServerMetadataHandler,
    getAuthWellKnownPaths,
    hasRoles,
    normalizeRoles,
} from "../dist/index.js";
import { createApiKeyGuard } from "../dist/nitro.js";
import { createNodeScryptPasswordHasher } from "../dist/password-node.js";
import {
    createResendAuthMailer,
    renderWelcomeEmail,
    renderVerificationEmail,
} from "../dist/resend.js";
import { authSchemaVersion, getInitialAuthSchemaURL } from "../dist/schema.js";
import { planAuthMigrations } from "../dist/postgres.js";

test("normalizes Better Auth role strings and supports any/all matching", () => {
    assert.deepEqual(normalizeRoles("user, moderator, user"), ["user", "moderator"]);
    assert.equal(hasRoles("user,moderator", ["admin", "moderator"]), true);
    assert.equal(hasRoles(["admin", "moderator"], ["admin", "moderator"], "all"), true);
    assert.equal(hasRoles("user", ["admin"], "all"), false);
    assert.equal(hasRoles(undefined, []), true);
});

test("API key guard accepts configured keys and rejects invalid headers", async () => {
    const guard = createApiKeyGuard({
        keys: ["first-key", "rotated-key"],
    });
    const event = (authorization) => ({
        req: {
            headers: new Headers(authorization ? { authorization } : undefined),
        },
    });

    await guard(event("Key rotated-key"));
    await assert.rejects(guard(event("Bearer rotated-key")), (error) => error.statusCode === 401);
    await assert.rejects(guard(event("Key invalid")), (error) => error.statusCode === 401);
});

test("builds OAuth and OpenID well-known paths from the auth base path", () => {
    assert.deepEqual(getAuthWellKnownPaths("/auth"), {
        oauthAuthorizationServer: [
            "/auth/.well-known/oauth-authorization-server",
            "/.well-known/oauth-authorization-server/auth",
        ],
        openIDConfiguration: "/auth/.well-known/openid-configuration",
    });
    assert.deepEqual(getAuthWellKnownPaths("/"), {
        oauthAuthorizationServer: ["/.well-known/oauth-authorization-server"],
        openIDConfiguration: "/.well-known/openid-configuration",
    });
    assert.throws(() => getAuthWellKnownPaths("auth"), /absolute pathname/);
});

test("exposes a Fetch handler for OAuth authorization metadata", async () => {
    const auth = {
        api: {
            async getOAuthServerConfig({ request, asResponse }) {
                assert.equal(request.url, "https://auth.example.com/discovery");
                assert.equal(asResponse, false);
                return {
                    issuer: "https://auth.example.com/auth",
                    authorization_endpoint: "https://auth.example.com/auth/oauth2/authorize",
                };
            },
        },
    };
    const handler = createOAuthAuthorizationServerMetadataHandler(auth, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
        },
    });
    const response = await handler(new Request("https://auth.example.com/discovery"));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("cache-control"), "public, max-age=300");
    assert.deepEqual(await response.json(), {
        issuer: "https://auth.example.com/auth",
        authorization_endpoint: "https://auth.example.com/auth/oauth2/authorize",
    });
});

test("well-known handlers require the OAuth provider plugin", () => {
    assert.throws(
        () => createOAuthAuthorizationServerMetadataHandler({ api: {} }),
        /Enable features\.oauthProvider/,
    );
});

test("creates isolated runtimes and closes owned resources once", async () => {
    let firstCloseCount = 0;
    let secondCloseCount = 0;
    const first = createAuth({
        secret: "V5eH2rY8pL4xW9cN7qT3mK6sD1jF0uBz",
        baseURL: "https://first.example.com",
        appName: "First",
        database: {
            configuration: memoryAdapter({}),
            async close() {
                firstCloseCount += 1;
            },
        },
        emailAndPassword: false,
    });
    const second = createAuth({
        secret: "Q8nC4vR1kM7yP2sL9wF6dT0xH5jB3uZe",
        baseURL: "https://second.example.com",
        appName: "Second",
        database: {
            configuration: memoryAdapter({}),
            async close() {
                secondCloseCount += 1;
            },
        },
        emailAndPassword: false,
    });

    assert.notEqual(first, second);
    assert.equal(first.options.baseURL, "https://first.example.com");
    assert.equal(second.options.baseURL, "https://second.example.com");

    await first.close();
    await first.close();
    await second.close();
    assert.equal(firstCloseCount, 1);
    assert.equal(secondCloseCount, 1);
});

test("scrypt adapter creates salted hashes and verifies them", async () => {
    const hasher = createNodeScryptPasswordHasher();
    const firstHash = await hasher.hash("correct horse battery staple");
    const secondHash = await hasher.hash("correct horse battery staple");

    assert.notEqual(firstHash, secondHash);
    assert.equal(
        await hasher.verify({
            hash: firstHash,
            password: "correct horse battery staple",
        }),
        true,
    );
    assert.equal(await hasher.verify({ hash: firstHash, password: "wrong" }), false);
    assert.equal(await hasher.verify({ hash: "not-a-valid-hash", password: "wrong" }), false);
});

test("email templates escape user-controlled content", () => {
    const branding = {
        appName: "NK",
        from: "NK <auth@example.com>",
        dashboardURL: "https://example.com/dashboard?a=1&b=2",
    };

    const welcome = renderWelcomeEmail(branding, {
        to: "person@example.com",
        name: "<script>alert(1)</script>",
    });
    const verification = renderVerificationEmail(branding, {
        to: "person@example.com",
        token: "secret",
        url: 'https://example.com/verify?a=1&next="dashboard"',
    });

    assert.doesNotMatch(welcome, /<script>/);
    assert.match(welcome, /&lt;script&gt;/);
    assert.match(verification, /&amp;/);
    assert.match(verification, /&quot;/);
});

test("Resend messages can be replaced and transformed through configuration", async () => {
    const sent = [];
    const lifecycle = [];
    const mailer = createResendAuthMailer({
        client: {
            emails: {
                async send(message) {
                    sent.push(message);
                    return { data: { id: "email-id" }, error: null };
                },
            },
        },
        appName: "Configured application",
        from: "Configured <auth@example.com>",
        templates: {
            verification(branding, input) {
                return {
                    subject: `Custom verification for ${branding.appName}`,
                    html: `<p>${input.token}</p>`,
                };
            },
        },
        hooks: {
            transformMessage(kind, message) {
                return {
                    ...message,
                    subject: `[${kind}] ${message.subject}`,
                };
            },
            onSent(kind) {
                lifecycle.push(kind);
            },
        },
    });

    await mailer.sendVerification({
        to: "person@example.com",
        token: "configured-token",
        url: "https://example.com/verify",
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, "[verification] Custom verification for Configured application");
    assert.equal(sent[0].from, "Configured <auth@example.com>");
    assert.match(sent[0].html, /configured-token/);
    assert.deepEqual(lifecycle, ["verification"]);
});

test("published entries do not read deployment environment or embed domains", async () => {
    const entryNames = ["index.js", "preset-nk.js", "resend.js", "vue.js"];
    const entries = await Promise.all(
        entryNames.map((entry) => readFile(new URL(`../dist/${entry}`, import.meta.url), "utf8")),
    );
    const publishedCode = entries.join("\n");

    assert.doesNotMatch(publishedCode, /process\.env/);
    assert.doesNotMatch(publishedCode, /https?:\/\//);
    assert.doesNotMatch(publishedCode, /BETTER_AUTH_SECRET/);
    assert.doesNotMatch(publishedCode, /RESEND_API_KEY/);
});

test("published schema asset is available and versioned", async () => {
    assert.equal(authSchemaVersion, 1);
    const schemaURL = getInitialAuthSchemaURL();
    await access(schemaURL);
    const schema = await readFile(schemaURL, "utf8");
    assert.match(schema, /CREATE TABLE "user"/);
    assert.match(schema, /CREATE TABLE "oauth_client"/);
});

test("migration planning is deterministic and side-effect free", () => {
    const initialPlan = planAuthMigrations(0);
    assert.equal(initialPlan.currentVersion, 0);
    assert.equal(initialPlan.targetVersion, authSchemaVersion);
    assert.deepEqual(
        initialPlan.pending.map((migration) => migration.version),
        [1],
    );

    const currentPlan = planAuthMigrations(authSchemaVersion);
    assert.deepEqual(currentPlan.pending, []);
});

test("Vue entry stays isolated from server-only technologies", async () => {
    const vueEntry = await readFile(new URL("../dist/vue.js", import.meta.url), "utf8");

    assert.match(vueEntry, /better-auth\/vue/);
    assert.match(vueEntry, /from "vue"/);
    assert.doesNotMatch(vueEntry, /node:/);
    assert.doesNotMatch(vueEntry, /from "nitro/);
    assert.doesNotMatch(vueEntry, /from "postgres"/);
    assert.doesNotMatch(vueEntry, /from "resend"/);
});
