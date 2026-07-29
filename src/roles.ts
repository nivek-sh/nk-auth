import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";
export {
    defaultAc as organizationAccessControl,
    defaultRoles as organizationRoles,
} from "better-auth/plugins/organization/access";

export const accessControl = createAccessControl(defaultStatements);

export const roles = {
    admin: accessControl.newRole({
        ...adminAc.statements,
    }),
    moderator: accessControl.newRole({
        user: ["list", "get", "update", "ban"],
        session: ["list", "revoke"],
    }),
    user: accessControl.newRole({
        ...userAc.statements,
    }),
};

export type Role = keyof typeof roles;
export type RoleInput = string | readonly string[] | null | undefined;
export type RoleMatchMode = "any" | "all";

export function normalizeRoles(input: RoleInput): string[] {
    if (!input) return [];
    const values = typeof input === "string" ? input.split(",") : input;
    return Array.from(new Set(values.map((role) => role.trim()).filter(Boolean)));
}

export function hasRoles(
    userRoles: RoleInput,
    requiredRoles: readonly string[],
    mode: RoleMatchMode = "any",
): boolean {
    if (requiredRoles.length === 0) return true;
    const currentRoles = new Set(normalizeRoles(userRoles));
    return mode === "all"
        ? requiredRoles.every((role) => currentRoles.has(role))
        : requiredRoles.some((role) => currentRoles.has(role));
}
