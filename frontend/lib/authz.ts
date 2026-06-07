import type { AuthUser } from "@/lib/api";

export type GuardedNavItem = {
  key: string;
  icon: string;
  label: string;
  href: string;
  requiresSuperAdmin?: boolean;
  requiresReview?: boolean;
};

export function canAccessNavItem(user: AuthUser | null, item: GuardedNavItem): boolean {
  if (!user) return false;
  if (item.requiresSuperAdmin && !user.is_super_admin) return false;
  if (item.requiresReview && !user.can_review) return false;
  return true;
}

export function canAccessPath(user: AuthUser | null, pathname: string | null): boolean {
  if (!user) return false;
  const path = pathname || "/";
  if (
    path.startsWith("/knowledge-nodes") ||
    path.startsWith("/knowledge-graph") ||
    path.startsWith("/data-center") ||
    path.startsWith("/feedback")
  ) {
    return user.is_super_admin;
  }
  if (path.startsWith("/review")) {
    return user.can_review;
  }
  return true;
}
