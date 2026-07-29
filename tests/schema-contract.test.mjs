import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getAuthTables } from "better-auth/db";
import { createNkAuth } from "../dist/preset-nk.js";

const compareStrings = (left, right) => left.localeCompare(right);

function expectedPostgresType(field, fieldName) {
    if (fieldName === "id" || field.references?.field === "id") return "TEXT";
    if (Array.isArray(field.type)) return "TEXT";

    switch (field.type) {
        case "string":
            return "TEXT";
        case "boolean":
            return "BOOLEAN";
        case "number":
            return field.bigint ? "BIGINT" : "INTEGER";
        case "date":
            return "TIMESTAMPTZ";
        case "json":
        case "string[]":
        case "number[]":
            return "JSONB";
        default:
            throw new Error(`Unsupported Better Auth field type: ${String(field.type)}`);
    }
}

function parsePublishedTables(sql) {
    const tables = new Map();
    const tablePattern = /CREATE TABLE "([^"]+)" \(\n([\s\S]*?)\n\);/g;

    for (const match of sql.matchAll(tablePattern)) {
        const columns = new Map();
        for (const line of match[2].split("\n")) {
            const column = /^\s{2}"([^"]+)"\s+([A-Z]+)(.*?)(?:,)?$/.exec(line);
            if (!column) continue;
            columns.set(column[1], {
                type: column[2],
                definition: column[3].replace(/,$/, ""),
            });
        }
        tables.set(match[1], columns);
    }

    return tables;
}

function resolveReference(schema, reference) {
    const table = schema[reference.model];
    assert.ok(table, `Referenced Better Auth model ${reference.model} is missing`);
    const field =
        reference.field === "id"
            ? "id"
            : (table.fields[reference.field]?.fieldName ?? reference.field);
    return {
        table: table.modelName,
        field,
        onDelete: (reference.onDelete ?? "cascade").toUpperCase(),
    };
}

test("published PostgreSQL schema matches the complete NK preset contract", async () => {
    const auth = createNkAuth({
        secret: "schema-contract-secret-with-more-than-thirty-two-random-characters",
        baseURL: "https://auth.example.com",
        appName: "Schema contract",
        database: {
            configuration: memoryAdapter([]),
        },
        mailer: {
            async sendVerification() {},
            async sendPasswordReset() {},
        },
    });

    try {
        assert.deepEqual(
            auth.options.plugins.map((plugin) => plugin.id),
            [
                "open-api",
                "bearer",
                "admin",
                "organization",
                "username",
                "jwt",
                "oauth-provider",
                "two-factor",
                "passkey",
            ],
        );
        assert.deepEqual(auth.options.disabledPaths, ["/token"]);
        assert.equal(auth.options.emailAndPassword.minPasswordLength, 8);
        assert.equal(auth.options.emailAndPassword.maxPasswordLength, 128);

        const organizationPlugin = auth.options.plugins.find(
            (plugin) => plugin.id === "organization",
        );
        assert.equal(organizationPlugin.options.dynamicAccessControl.enabled, true);
        assert.ok(organizationPlugin.options.ac);
        assert.ok(organizationPlugin.options.roles);

        const jwtPlugin = auth.options.plugins.find((plugin) => plugin.id === "jwt");
        assert.equal(jwtPlugin.options.disableSettingJwtHeader, true);

        const expectedSchema = getAuthTables(auth.options);
        const schemaSQL = await readFile(
            new URL("../dist/schema/0001_initial.sql", import.meta.url),
            "utf8",
        );
        assert.doesNotMatch(schemaSQL, /ROW LEVEL SECURITY/);
        const actualTables = parsePublishedTables(schemaSQL);
        const expectedTableNames = Object.values(expectedSchema)
            .map((table) => table.modelName)
            .sort(compareStrings);

        assert.deepEqual([...actualTables.keys()].sort(compareStrings), expectedTableNames);

        for (const [logicalTableName, expectedTable] of Object.entries(expectedSchema)) {
            const actualColumns = actualTables.get(expectedTable.modelName);
            assert.ok(actualColumns, `Missing table ${expectedTable.modelName}`);

            const expectedColumnNames = [
                "id",
                ...Object.entries(expectedTable.fields).map(
                    ([logicalFieldName, field]) => field.fieldName ?? logicalFieldName,
                ),
            ].sort(compareStrings);
            assert.deepEqual(
                [...actualColumns.keys()].sort(compareStrings),
                expectedColumnNames,
                `Column mismatch in ${expectedTable.modelName}`,
            );

            for (const [logicalFieldName, field] of Object.entries(expectedTable.fields)) {
                const fieldName = field.fieldName ?? logicalFieldName;
                const actual = actualColumns.get(fieldName);
                assert.ok(actual, `Missing ${expectedTable.modelName}.${fieldName}`);
                assert.equal(
                    actual.type,
                    expectedPostgresType(field, fieldName),
                    `Type mismatch in ${expectedTable.modelName}.${fieldName}`,
                );
                assert.equal(
                    actual.definition.includes("NOT NULL"),
                    field.required !== false,
                    `Nullability mismatch in ${expectedTable.modelName}.${fieldName}`,
                );

                if (field.unique) {
                    assert.ok(
                        actual.definition.includes("UNIQUE"),
                        `Missing unique constraint on ${expectedTable.modelName}.${fieldName}`,
                    );
                }
                if (field.type === "date" && typeof field.defaultValue === "function") {
                    assert.ok(
                        actual.definition.includes("DEFAULT CURRENT_TIMESTAMP"),
                        `Missing timestamp default on ${expectedTable.modelName}.${fieldName}`,
                    );
                }
                if (field.references) {
                    const reference = resolveReference(expectedSchema, field.references);
                    const clause =
                        `REFERENCES "${reference.table}" ("${reference.field}") ` +
                        `ON DELETE ${reference.onDelete}`;
                    assert.ok(
                        actual.definition.includes(clause),
                        `Reference mismatch in ${expectedTable.modelName}.${fieldName}`,
                    );
                }
                if (field.index) {
                    const indexKind = field.unique ? "UNIQUE INDEX" : "INDEX";
                    const suffix = field.unique ? "uidx" : "idx";
                    const statement =
                        `CREATE ${indexKind} "${expectedTable.modelName}_${fieldName}_${suffix}" ` +
                        `ON "${expectedTable.modelName}" ("${fieldName}")`;
                    assert.ok(
                        schemaSQL.includes(statement),
                        `Missing index on ${expectedTable.modelName}.${fieldName}`,
                    );
                }
            }

            const id = actualColumns.get("id");
            assert.equal(id.type, "TEXT", `ID type mismatch in ${logicalTableName}`);
            assert.ok(id.definition.includes("NOT NULL PRIMARY KEY"));
        }
    } finally {
        await auth.close();
    }
});
