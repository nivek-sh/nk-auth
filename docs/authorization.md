# Authorization with separate application databases

`@nk-sh/auth` separates authentication from application authorization. The auth service owns the
user identity and proves it to other services. Each application remains responsible for deciding
what that identity may do with its own domain data.

## Choose the correct authorization level

| Level             | Stored by                            | Use it for                                     | Examples                                             |
| ----------------- | ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| Global auth role  | `nk-auth` user record                | Operating the identity service itself          | Manage users, ban users, revoke sessions             |
| Organization role | `nk-auth` organization member record | Membership shared by several applications      | Organization owner, member, billing administrator    |
| Application role  | The application's database           | Product-specific authorization                 | Invoice approver, warehouse operator, project viewer |
| OAuth scope       | OAuth client and access token        | Limiting what a client may request from an API | `invoice:read`, `invoice:write`                      |

Do not reuse the global `admin` role as an automatic administrator role in every product. A
compromised global role would otherwise cross every application boundary. Treat global roles,
organization roles, OAuth scopes, and application permissions as separate checks.

## Recommended application data model

The application database stores the auth user ID as an external identifier. It must not create a
database foreign key to the auth database.

```sql
CREATE TABLE application_role_assignment (
    auth_user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (auth_user_id, tenant_id, role)
);

CREATE INDEX application_role_assignment_tenant_idx
    ON application_role_assignment (tenant_id, auth_user_id);
```

Use an empty `tenant_id` for an application-wide assignment, or replace it with the product's own
workspace/account identifier. Keep permission definitions in versioned code when they are part of
the product's security model:

```ts
import { createPermissionPolicy } from "@nk-sh/auth";

export const invoicePolicy = createPermissionPolicy({
    viewer: ["invoice:read"],
    accountant: ["invoice:read", "invoice:update"],
    approver: ["invoice:read", "invoice:approve"],
    owner: ["*"],
} as const);
```

The wildcard grants every permission, so reserve it for roles whose meaning is unambiguous. Unknown
roles grant no permissions. Multiple assigned roles are combined.

If administrators must create permissions at runtime, store normalized roles and permissions in
the application database instead. The application should still load them by `auth_user_id` and
evaluate them server-side with a deny-by-default rule.

## Protect a separate application API

Register the application as an OAuth client of the auth service and use Authorization Code with
PKCE. Request a resource/audience that uniquely identifies the API. The API validates the JWT
access token locally with the auth service's public JWKS:

```ts
// server/utils/resource-auth.ts
import { createAccessTokenVerifier } from "@nk-sh/auth/resource-server";

export const resourceAuth = createAccessTokenVerifier({
    issuer: "https://auth.example.com/auth",
    audience: "https://invoices.example.com",
    jwksURL: "https://auth.example.com/auth/jwks",
});
```

Always configure and validate both `issuer` and `audience`. A valid token issued for a different API
must not be accepted.

Then combine token verification, OAuth scopes, and the application's role assignment in Nitro:

```ts
// server/routes/invoices/[id]/approve.post.ts
import { createPermissionPolicy } from "@nk-sh/auth";
import { defineAccessTokenHandler } from "@nk-sh/auth/nitro";
import { getAccessTokenSubject } from "@nk-sh/auth/resource-server";
import { z } from "zod";
import { appDatabase } from "../../utils/database";
import { resourceAuth } from "../../utils/resource-auth";

const policy = createPermissionPolicy({
    viewer: ["invoice:read"],
    approver: ["invoice:read", "invoice:approve"],
    owner: ["*"],
} as const);

export default defineAccessTokenHandler({
    auth: resourceAuth,
    scopes: ["invoice:write"],
    params: z.object({ id: z.string().min(1) }),
    async authorize({ claims, params }) {
        const authUserId = getAccessTokenSubject(claims);
        const invoice = await appDatabase.invoice.findById(params.id);
        if (!invoice) return false;

        const assignments = await appDatabase.roleAssignment.findMany({
            authUserId,
            tenantId: invoice.tenantId,
        });

        return policy.hasPermissions(
            assignments.map((assignment) => assignment.role),
            ["invoice:approve"],
        );
    },
    async handler({ claims, params }) {
        return appDatabase.invoice.approve({
            id: params.id,
            approvedByAuthUserId: getAccessTokenSubject(claims),
        });
    },
});
```

The order is authentication, input validation, application authorization, and finally the route
handler. A missing or invalid token produces `401`; a rejected application policy produces `403`.

For non-Nitro services, call `resourceAuth.verifyRequest(request, { scopes })` and then use
`getAccessTokenSubject(claims)` in the same way.

### Local verification and introspection

Local JWKS verification is the normal path: it avoids a database lookup and keeps applications
available during a short auth-service outage. Key rotation is handled through the token's key ID
and the published JWKS.

Remote introspection is available when immediate token/session revocation is more important than a
network hop on every request:

```ts
const resourceAuth = createAccessTokenVerifier({
    issuer: "https://auth.example.com/auth",
    audience: "https://invoices.example.com",
    remoteVerification: {
        introspectURL: "https://auth.example.com/auth/oauth2/introspect",
        clientId: config.introspectionClientId,
        clientSecret: config.introspectionClientSecret,
        force: true,
    },
});
```

Keep the introspection secret only in the API service. Never ship it to Vue or another browser
client. Prefer short-lived JWT access tokens for most APIs.

## Configure global auth-service roles

The built-in global roles are:

- `admin`: all Better Auth user and session administration permissions.
- `moderator`: list, read, update, and ban users; list and revoke sessions.
- `user`: no identity administration permissions.

These roles only govern Better Auth administration endpoints. Change a role through the protected
Better Auth admin API, for example `auth.api.setRole`; never update the auth table from an
application service.

Custom roles are configured with Better Auth's access-control primitives:

```ts
// auth-access.ts, shared by the auth server and its Vue administration UI
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

export const globalAccessControl = createAccessControl({
    ...defaultStatements,
    audit: ["read", "export"],
} as const);

export const globalRoles = {
    admin: globalAccessControl.newRole({
        ...adminAc.statements,
        audit: ["read", "export"],
    }),
    auditor: globalAccessControl.newRole({
        ...userAc.statements,
        audit: ["read"],
    }),
    user: globalAccessControl.newRole({
        ...userAc.statements,
    }),
};
```

Pass the access controller and roles together:

```ts
const auth = createAuth({
    ...config,
    features: {
        admin: {
            ac: globalAccessControl,
            roles: globalRoles,
            defaultRole: "user",
            adminRoles: ["admin", "auditor"],
        },
    },
});
```

`ac` and `roles` are a pair because role objects are created by that access controller. The library
rejects a configuration that supplies only one of them.

The Vue administration client must use the same pair if it performs client-side permission checks:

```ts
const authVue = createAuthVuePlugin({
    baseURL: "https://auth.example.com",
    accessControl: {
        admin: {
            ac: globalAccessControl,
            roles: globalRoles,
        },
    },
});
```

Client checks are useful for hiding unavailable controls, but the server remains authoritative.

## Organization roles

Use Better Auth organization roles when membership and permissions genuinely belong to a shared
organization used by several products. Static custom organization roles can be passed through
`features.organization.ac` and `features.organization.roles`.

When `dynamicAccessControl.enabled` is set, organization administrators may define roles at runtime.
The initial auth schema already includes the required `organization_role` table. Apply the
published auth schema before enabling it. The `createNkAuth` preset enables this capability with
Better Auth's built-in organization access control; lower-level `createAuth` configurations must
enable it explicitly.

Dynamic permission definitions are serialized as JSON into the `permission` text column. Keeping
that column as text matches Better Auth's string storage contract: Better Auth serializes values
before writing them and parses them after reading them.

For example:

```ts
const auth = createAuth({
    ...config,
    features: {
        organization: {
            allowUserToCreateOrganization: false,
            creatorRole: "owner",
            ac: organizationAccessControl,
            roles: organizationRoles,
            dynamicAccessControl: {
                enabled: true,
                maximumRolesPerOrganization: 25,
            },
        },
    },
});
```

An organization role should not silently grant permissions over product records. The product API
must deliberately map the organization membership to its own authorization decision.

## Session-cookie routes

`defineAuthHandler` remains available for routes that run with direct access to the Better Auth
runtime, normally inside the auth service or a same-origin backend:

```ts
export default defineAuthHandler({
    auth,
    roles: ["admin"],
    async authorize({ session }) {
        return securityPolicy.allows(session.user.id);
    },
    handler({ session }) {
        return { userId: session.user.id };
    },
});
```

For a separately deployed application API, prefer OAuth access tokens and
`defineAccessTokenHandler`. Do not forward browser cookies between unrelated domains or query the
auth database from the application.

## Operational rules

- Use the access-token `sub` claim as the stable external user ID. Email and username can change.
- Validate issuer, audience, expiry, signature, and endpoint scopes on every request.
- Store app assignments in the app database and audit every role change.
- Deny unknown roles and permissions.
- Keep tokens short-lived; do not embed fast-changing application permissions in long-lived tokens.
- Re-check ownership and tenant boundaries for each resource, not only the user's broad role.
- Enforce authorization on the server. Vue can mirror a decision for presentation but cannot grant
  access.
- Remove or disable app role assignments when an account is deprovisioned. An event/outbox flow is
  preferable to a cross-database transaction.

Better Auth reference material:

- [Admin access control](https://better-auth.com/docs/plugins/admin)
- [Organization access control](https://better-auth.com/docs/plugins/organization)
- [OAuth provider and resource-server verification](https://better-auth.com/docs/plugins/oauth-provider)
