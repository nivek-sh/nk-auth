import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PasswordHasher } from "./types.js";

const scrypt = promisify(nodeScrypt);

export interface NodeScryptOptions {
    saltBytes?: number;
    keyLength?: number;
}

export function createNodeScryptPasswordHasher(options: NodeScryptOptions = {}): PasswordHasher {
    const saltBytes = options.saltBytes ?? 16;
    const keyLength = options.keyLength ?? 64;

    return {
        async hash(password) {
            const salt = randomBytes(saltBytes).toString("hex");
            const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
            return `${salt}:${derivedKey.toString("hex")}`;
        },
        async verify({ hash, password }) {
            const [salt, encodedKey, ...extra] = hash.split(":");
            if (!salt || !encodedKey || extra.length > 0) return false;

            const storedKey = Buffer.from(encodedKey, "hex");
            if (storedKey.length === 0) return false;

            const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

            return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
        },
    };
}
