import axios from "axios";

/**
 * Multi-tenant UX: when the API returns 403, show a clear message naming the
 * action and the member's current workspace role.
 */
export function formatForbiddenActionNotice(
  error: unknown,
  action: string,
  workspaceRoleLabel: string | null,
): string | undefined {
  if (
    !workspaceRoleLabel ||
    !axios.isAxiosError(error) ||
    error.response?.status !== 403
  ) {
    return undefined;
  }
  return `${action}: action not allowed for ${workspaceRoleLabel}`;
}
