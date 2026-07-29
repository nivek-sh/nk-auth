import { defineConfig } from "tsdown";

export default defineConfig({
    entry: {
        cli: "src/cli.ts",
        index: "src/index.ts",
        nitro: "src/nitro.ts",
        "password-node": "src/password-node.ts",
        postgres: "src/postgres.ts",
        "preset-nk": "src/preset-nk.ts",
        "resource-server": "src/resource-server.ts",
        resend: "src/resend.ts",
        schema: "src/schema.ts",
        vue: "src/vue.ts",
        "well-known": "src/well-known.ts",
    },
    outDir: "dist",
    format: "esm",
    platform: "neutral",
    target: "es2022",
    clean: true,
    sourcemap: true,
    dts: {
        sourcemap: true,
    },
    deps: {
        // Keep Better Auth and every adapter technology visible to consumers.
        // Separate entry points prevent the Vue build from loading Node modules.
        neverBundle: true,
    },
    copy: [
        {
            from: "schemas/tables.sql",
            to: "dist/schema",
            rename: "0001_initial.sql",
        },
    ],
    publint: true,
});
