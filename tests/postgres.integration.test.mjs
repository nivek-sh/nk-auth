import assert from "node:assert/strict";
import test from "node:test";
import {
    applyAuthMigrations,
    createPostgresAuthDatabase,
    getAuthSchemaVersion,
} from "../dist/postgres.js";

const databaseURL = process.env.AUTH_TEST_DATABASE_URL;

test(
    "applies the auth schema to an empty PostgreSQL database",
    { skip: !databaseURL },
    async () => {
        const database = createPostgresAuthDatabase({
            url: databaseURL,
        });

        try {
            assert.equal(await getAuthSchemaVersion(database), 0);
            const applied = await applyAuthMigrations(database);
            assert.equal(applied.currentVersion, 0);
            assert.deepEqual(
                applied.pending.map((migration) => migration.version),
                [1],
            );
            assert.equal(await getAuthSchemaVersion(database), 1);

            const tables = await database.client.unsafe(
                `SELECT tablename
         FROM pg_tables
         WHERE schemaname = 'public'
         ORDER BY tablename`,
            );
            const tableNames = tables.map((row) => row.tablename);
            assert.ok(tableNames.includes("user"));
            assert.ok(tableNames.includes("session"));
            assert.ok(tableNames.includes("oauth_client"));
            assert.ok(tableNames.includes("organization_role"));
            assert.ok(tableNames.includes("_nk_auth_migrations"));

            const permissionColumns = await database.client.unsafe(
                `SELECT data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'organization_role'
           AND column_name = 'permission'`,
            );
            assert.equal(permissionColumns.length, 1);
            assert.equal(permissionColumns[0].data_type, "text");

            const current = await applyAuthMigrations(database, { dryRun: true });
            assert.deepEqual(current.pending, []);
        } finally {
            await database.close();
        }
    },
);
