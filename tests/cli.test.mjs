import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function runCLI(...args) {
    return spawnSync(process.execPath, [cliPath, ...args], {
        encoding: "utf8",
    });
}

test("CLI exposes help without opening a database connection", () => {
    const result = runCLI("--help");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /nk-auth migrate --database-url/);
    assert.match(result.stdout, /nk-auth status --database-url/);
    assert.equal(result.stderr, "");
});

test("CLI reports the installed package version", async () => {
    const packageJSON = JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const result = runCLI("--version");

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), packageJSON.version);
});

test("CLI requires an explicit PostgreSQL connection URL", () => {
    const result = runCLI("migrate");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /--database-url is required/);
});

test("CLI rejects non-PostgreSQL URLs before connecting", () => {
    const result = runCLI("migrate", "--database-url", "https://database.example.com");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /postgres: or postgresql: protocol/);
    assert.doesNotMatch(result.stderr, /database\.example\.com/);
});

test("package exposes the nk-auth executable", async () => {
    const packageJSON = JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const firstLine = (await readFile(cliPath, "utf8")).split("\n", 1)[0];

    assert.equal(packageJSON.bin["nk-auth"], "./dist/cli.js");
    assert.equal(firstLine, "#!/usr/bin/env node");
});
