import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import {
    authMigrations,
    authSchemaVersion,
    loadAuthMigration,
    type AuthMigration,
} from "./schema.js";
import type { AuthDatabase } from "./types.js";

export interface PostgresAuthDatabaseOptions {
    url: string;
    options?: postgres.Options<Record<string, postgres.PostgresType>>;
    closeTimeoutSeconds?: number;
}

export interface PostgresAuthDatabase extends AuthDatabase {
    readonly client: postgres.Sql;
    readonly dialect: PostgresJSDialect;
}

export function createPostgresAuthDatabase(
    options: PostgresAuthDatabaseOptions,
): PostgresAuthDatabase {
    const client = postgres(options.url, options.options);
    const dialect = new PostgresJSDialect({ postgres: client });
    let closed = false;

    return {
        client,
        dialect,
        configuration: {
            dialect,
            type: "postgres",
        },
        async close() {
            if (closed) return;
            closed = true;
            await client.end({
                timeout: options.closeTimeoutSeconds ?? 5,
            });
        },
    };
}

export interface AuthMigrationPlan {
    currentVersion: number;
    targetVersion: number;
    pending: readonly AuthMigration[];
}

export interface ApplyAuthMigrationsOptions {
    dryRun?: boolean;
}

const MIGRATION_TABLE = "_nk_auth_migrations";

export function planAuthMigrations(currentVersion: number): AuthMigrationPlan {
    return {
        currentVersion,
        targetVersion: authSchemaVersion,
        pending: authMigrations.filter((migration) => migration.version > currentVersion),
    };
}

export async function getAuthSchemaVersion(
    database: Pick<PostgresAuthDatabase, "client">,
): Promise<number> {
    const relationRows = await database.client.unsafe<Array<{ migration_table: string | null }>>(
        `SELECT to_regclass('public.${MIGRATION_TABLE}')::text AS migration_table`,
    );
    if (!relationRows[0]?.migration_table) return 0;

    const versionRows = await database.client.unsafe<Array<{ version: number }>>(
        `SELECT COALESCE(MAX(version), 0)::int AS version FROM "${MIGRATION_TABLE}"`,
    );
    return versionRows[0]?.version ?? 0;
}

export async function applyAuthMigrations(
    database: Pick<PostgresAuthDatabase, "client">,
    options: ApplyAuthMigrationsOptions = {},
): Promise<AuthMigrationPlan> {
    const currentVersion = await getAuthSchemaVersion(database);
    const plan = planAuthMigrations(currentVersion);
    if (options.dryRun || plan.pending.length === 0) return plan;

    await database.client.begin(async (transaction) => {
        await transaction.unsafe(
            `CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
        "version" INTEGER PRIMARY KEY,
        "name" TEXT NOT NULL,
        "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
        );

        for (const migration of plan.pending) {
            const sql = await loadAuthMigration(migration);
            await transaction.unsafe(sql);
            await transaction.unsafe(
                `INSERT INTO "${MIGRATION_TABLE}" ("version", "name")
         VALUES ($1, $2)`,
                [migration.version, migration.name],
            );
        }
    });

    return plan;
}
