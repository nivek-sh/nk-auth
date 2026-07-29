#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
    applyAuthMigrations,
    createPostgresAuthDatabase,
    getAuthSchemaVersion,
    planAuthMigrations,
    type AuthMigrationPlan,
} from "./postgres.js";

const HELP = `@nk-sh/auth database CLI

Usage:
    nk-auth migrate --database-url <postgres-url> [--dry-run]
    nk-auth status --database-url <postgres-url>
    nk-auth --help
    nk-auth --version

Commands:
    migrate    Apply every pending auth migration in a transaction.
    status     Show the current and target auth schema versions.

Options:
    -d, --database-url <url>    PostgreSQL connection URL.
        --dry-run               Show pending migrations without applying them.
    -h, --help                  Show this help.
    -v, --version               Show the installed package version.
`;

interface CLIOutput {
    log(message: string): void;
    error(message: string): void;
}

const output: CLIOutput = {
    log(message) {
        console.log(message);
    },
    error(message) {
        console.error(message);
    },
};

function formatPlan(plan: AuthMigrationPlan, action: "Applied" | "Pending"): string[] {
    if (plan.pending.length === 0) {
        return [`Schema is current at version ${plan.targetVersion}.`];
    }

    return [
        `${action} migrations:`,
        ...plan.pending.map(
            (migration) => `  ${migration.version.toString().padStart(4, "0")} ${migration.name}`,
        ),
        `Schema version: ${plan.currentVersion} -> ${plan.targetVersion}.`,
    ];
}

function validateDatabaseURL(input: string | undefined): string {
    if (!input) {
        throw new Error("--database-url is required");
    }

    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        throw new Error("--database-url must be a valid PostgreSQL URL");
    }

    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("--database-url must use the postgres: or postgresql: protocol");
    }

    return input;
}

function sanitizeError(error: unknown, databaseURL?: string): string {
    let message = error instanceof Error ? error.message : String(error);
    if (!databaseURL) return message;

    message = message.replaceAll(databaseURL, "[database URL]");
    try {
        const password = decodeURIComponent(new URL(databaseURL).password);
        if (password) message = message.replaceAll(password, "[password]");
    } catch {
        // URL validation reports the actionable error before a connection is attempted.
    }
    return message;
}

async function readPackageVersion(): Promise<string> {
    const packageJSON = JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
        version?: unknown;
    };
    return typeof packageJSON.version === "string" ? packageJSON.version : "unknown";
}

function parseCLIArguments(args: readonly string[]) {
    return parseArgs({
        args: [...args],
        allowPositionals: true,
        strict: true,
        options: {
            "database-url": {
                type: "string",
                short: "d",
            },
            "dry-run": {
                type: "boolean",
                default: false,
            },
            help: {
                type: "boolean",
                short: "h",
                default: false,
            },
            version: {
                type: "boolean",
                short: "v",
                default: false,
            },
        },
    });
}

async function run(args: readonly string[]): Promise<number> {
    let parsed: ReturnType<typeof parseCLIArguments>;

    try {
        parsed = parseCLIArguments(args);
    } catch (error) {
        output.error(`nk-auth: ${sanitizeError(error)}`);
        output.error("Run `nk-auth --help` for usage.");
        return 1;
    }

    if (parsed.values.help) {
        output.log(HELP.trimEnd());
        return 0;
    }

    if (parsed.values.version) {
        output.log(await readPackageVersion());
        return 0;
    }

    const [command, ...extraPositionals] = parsed.positionals;
    if (!command) {
        output.error("nk-auth: a command is required");
        output.error("Run `nk-auth --help` for usage.");
        return 1;
    }
    if (extraPositionals.length > 0) {
        output.error(`nk-auth: unexpected argument "${extraPositionals[0]}"`);
        return 1;
    }
    if (command !== "migrate" && command !== "status") {
        output.error(`nk-auth: unknown command "${command}"`);
        output.error("Run `nk-auth --help` for usage.");
        return 1;
    }
    if (command === "status" && parsed.values["dry-run"]) {
        output.error("nk-auth: --dry-run is only valid with the migrate command");
        return 1;
    }

    let databaseURL: string | undefined;
    try {
        databaseURL = validateDatabaseURL(parsed.values["database-url"]);
        const database = createPostgresAuthDatabase({ url: databaseURL });

        try {
            if (command === "status") {
                const currentVersion = await getAuthSchemaVersion(database);
                const plan = planAuthMigrations(currentVersion);
                for (const line of formatPlan(plan, "Pending")) output.log(line);
                return 0;
            }

            const dryRun = parsed.values["dry-run"];
            const plan = await applyAuthMigrations(database, { dryRun });
            for (const line of formatPlan(plan, dryRun ? "Pending" : "Applied")) {
                output.log(line);
            }
            return 0;
        } finally {
            await database.close?.();
        }
    } catch (error) {
        output.error(`nk-auth: ${sanitizeError(error, databaseURL)}`);
        return 1;
    }
}

process.exitCode = await run(process.argv.slice(2));
