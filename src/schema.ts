import { readFile } from "node:fs/promises";

export interface AuthMigration {
    version: number;
    name: string;
    url: URL;
}

export const authMigrations: readonly AuthMigration[] = [
    {
        version: 1,
        name: "initial",
        url: new URL("./schema/0001_initial.sql", import.meta.url),
    },
];

export const authSchemaVersion = authMigrations[authMigrations.length - 1]?.version ?? 0;

export function getInitialAuthSchemaURL(): URL {
    const migration = authMigrations[0];
    if (!migration) throw new Error("The initial auth schema is unavailable");
    return migration.url;
}

export async function loadAuthMigration(migration: AuthMigration): Promise<string> {
    return readFile(migration.url, "utf8");
}
