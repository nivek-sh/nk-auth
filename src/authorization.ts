import { normalizeRoles, type RoleInput } from "./roles.js";

export type PermissionInput = string | readonly string[] | null | undefined;
export type PermissionMatchMode = "any" | "all";

export function normalizePermissions(input: PermissionInput): string[] {
    if (!input) return [];
    const values = typeof input === "string" ? input.split(",") : input;
    return Array.from(new Set(values.map((permission) => permission.trim()).filter(Boolean)));
}

export function hasPermissions(
    grantedPermissions: PermissionInput,
    requiredPermissions: readonly string[],
    mode: PermissionMatchMode = "all",
): boolean {
    if (requiredPermissions.length === 0) return true;
    const granted = new Set(normalizePermissions(grantedPermissions));
    if (granted.has("*")) return true;
    return mode === "all"
        ? requiredPermissions.every((permission) => granted.has(permission))
        : requiredPermissions.some((permission) => granted.has(permission));
}

export type PermissionPolicyDefinition = Readonly<Record<string, readonly string[]>>;
export type PermissionPolicyRole<TDefinition extends PermissionPolicyDefinition> = Extract<
    keyof TDefinition,
    string
>;
export type PermissionPolicyPermission<TDefinition extends PermissionPolicyDefinition> = Exclude<
    TDefinition[keyof TDefinition][number],
    "*"
>;

export interface PermissionPolicy<TDefinition extends PermissionPolicyDefinition> {
    readonly definition: TDefinition;
    readonly roleNames: readonly PermissionPolicyRole<TDefinition>[];
    permissionsFor(assignedRoles: RoleInput): string[];
    hasPermissions(
        assignedRoles: RoleInput,
        requiredPermissions: readonly PermissionPolicyPermission<TDefinition>[],
        mode?: PermissionMatchMode,
    ): boolean;
}

/**
 * Creates a storage-agnostic RBAC policy. Applications retain ownership of role
 * assignments and only pass the assigned role names into this policy.
 */
export function createPermissionPolicy<const TDefinition extends PermissionPolicyDefinition>(
    definition: TDefinition,
): PermissionPolicy<TDefinition> {
    const roleNames = Object.keys(definition) as PermissionPolicyRole<TDefinition>[];
    const permissionsByRole = new Map<string, readonly string[]>();

    for (const roleName of roleNames) {
        if (!roleName.trim()) {
            throw new Error("Permission policy role names cannot be empty");
        }
        const configuredPermissions = definition[roleName] ?? [];
        const permissions = normalizePermissions(configuredPermissions);
        if (permissions.length !== configuredPermissions.length) {
            throw new Error(`Role "${roleName}" contains empty or duplicate permissions`);
        }
        permissionsByRole.set(roleName, permissions);
    }

    const permissionsFor = (assignedRoles: RoleInput): string[] => {
        const permissions = new Set<string>();
        for (const role of normalizeRoles(assignedRoles)) {
            for (const permission of permissionsByRole.get(role) ?? []) {
                permissions.add(permission);
            }
        }
        return [...permissions];
    };

    return {
        definition,
        roleNames,
        permissionsFor,
        hasPermissions(assignedRoles, requiredPermissions, mode = "all") {
            return hasPermissions(permissionsFor(assignedRoles), requiredPermissions, mode);
        },
    };
}
