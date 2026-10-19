// Mirrors has_full_access() in backend/app/core/dependencies.py. Full access needs BOTH conditions:
//   1. the user is a superuser (is_superuser === true), AND
//   2. the user's role is named "Developer" (case-insensitive, surrounding spaces ignored).
// A superuser with any other role, or a Developer-role user who isn't a superuser, gets only what Menu
// Access granted their role. This only decides what the UI shows -- the backend enforces the same rule
// on every API call, so keep the two in sync and use this helper instead of repeating the check.

export const DEVELOPER_ROLE_NAME = "developer";

interface AccessSubject {
  is_superuser?: boolean | null;
  role?: { name?: string | null } | null;
}

export function isDeveloperRoleName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === DEVELOPER_ROLE_NAME;
}

export function hasFullAccess(user: AccessSubject | null | undefined): boolean {
  return user?.is_superuser === true && isDeveloperRoleName(user.role?.name);
}
