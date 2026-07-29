import assert from "node:assert/strict";
import test from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "../dist/index.js";

function createOAuthAuth(features, disabledPaths = []) {
    return createAuth({
        secret: "oauth-configuration-secret-with-more-than-thirty-two-random-characters",
        baseURL: "https://auth.example.com",
        appName: "OAuth configuration",
        database: {
            configuration: memoryAdapter([]),
        },
        disabledPaths,
        emailAndPassword: false,
        features,
    });
}

test("OAuth Provider mode coordinates the JWT plugin and disabled paths", async () => {
    const auth = createOAuthAuth(
        {
            jwt: true,
            oauthProvider: {
                loginPage: "/sign-in",
                consentPage: "/consent",
            },
        },
        ["/is-username-available"],
    );

    try {
        assert.deepEqual(auth.options.disabledPaths, ["/is-username-available", "/token"]);
        const jwtPlugin = auth.options.plugins.find((plugin) => plugin.id === "jwt");
        assert.equal(jwtPlugin.options.disableSettingJwtHeader, true);
    } finally {
        await auth.close();
    }
});

test("OAuth Provider requires JWT unless its JWT integration is disabled", async () => {
    assert.throws(
        () =>
            createOAuthAuth({
                oauthProvider: {
                    loginPage: "/sign-in",
                    consentPage: "/consent",
                },
            }),
        /requires features\.jwt/,
    );

    const auth = createOAuthAuth({
        oauthProvider: {
            loginPage: "/sign-in",
            consentPage: "/consent",
            disableJwtPlugin: true,
        },
    });
    try {
        assert.equal(
            auth.options.plugins.some((plugin) => plugin.id === "jwt"),
            false,
        );
    } finally {
        await auth.close();
    }
});
