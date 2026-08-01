import { createAccessControl } from "better-auth/plugins/access";

// ---------------------------------------------------------------------------
// Better Auth role-based access control (RBAC).
//
// These statements and roles are used by the Better Auth admin plugin.
// The local API routes additionally use the requireAdmin/requireSuperAdmin
// middleware, but Better Auth itself uses these roles to protect its own
// /api/auth/admin endpoints.
// ---------------------------------------------------------------------------

const statements = {
  user: [
    "get",
    "list",
    "create",
    "update",
    "delete",
    "set-role",
    "set-password",
    "set-email",
    "ban",
  ],
  session: ["list", "revoke", "delete"],
} as const;

export const ac = createAccessControl(statements);

export const userRole = ac.newRole({});

// Admins can manage users and sessions but cannot change roles or delete users.
export const adminRole = ac.newRole({
  user: ["get", "list", "create", "update", "ban"],
  session: ["list", "revoke", "delete"],
});

// Superadmins have full control, including destructive actions and role changes.
export const superadminRole = ac.newRole({
  user: [
    "get",
    "list",
    "create",
    "update",
    "delete",
    "set-role",
    "set-password",
    "set-email",
    "ban",
  ],
  session: ["list", "revoke", "delete"],
});
