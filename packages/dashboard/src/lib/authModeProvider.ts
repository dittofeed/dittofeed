import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { useRouter } from "next/router";
import qs from "qs";
import { createContext, useContext, useMemo } from "react";

import { useAppStorePick } from "./appStore";

export const AuthModeTypeEnum = {
  Embedded: "Embedded",
  Base: "Base",
} as const;

export type AuthModeType =
  (typeof AuthModeTypeEnum)[keyof typeof AuthModeTypeEnum];

export interface EmbeddedAuthMode {
  type: typeof AuthModeTypeEnum.Embedded;
  token: string;
}

export interface BaseAuthMode {
  type: typeof AuthModeTypeEnum.Base;
}

export type AuthContextMode = EmbeddedAuthMode | BaseAuthMode;

export const AuthContext = createContext<AuthContextMode>({
  type: AuthModeTypeEnum.Base,
});

export function useBaseApiUrl({
  licensed = false,
}: { licensed?: boolean } = {}) {
  const { apiBase } = useAppStorePick(["apiBase"]);
  const authContext = useContext(AuthContext);
  switch (authContext.type) {
    case AuthModeTypeEnum.Embedded:
      return `${apiBase}/api-l/embedded`;
    case AuthModeTypeEnum.Base:
      if (licensed) {
        return `${apiBase}/api-l`;
      }
      return `${apiBase}/api`;
    default:
      assertUnreachable(authContext);
  }
}

export function useAuthHeaders(): Record<string, string> {
  const authContext = useContext(AuthContext);
  switch (authContext.type) {
    case AuthModeTypeEnum.Embedded:
      return { Authorization: `Bearer ${authContext.token}` };
    case AuthModeTypeEnum.Base:
      return {};
    default:
      assertUnreachable(authContext);
  }
}

interface UniversalRouter {
  push: (path: string, query?: Record<string, string>) => void;
}

export function useUniversalRouter() {
  const authContext = useContext(AuthContext);
  const router = useRouter();
  const universalRouter: UniversalRouter = useMemo(() => {
    let push: UniversalRouter["push"];
    switch (authContext.type) {
      case AuthModeTypeEnum.Embedded:
        push = (path: string, query?: Record<string, string>) => {
          const queryString = query ? `?${qs.stringify(query)}` : "";
          const fullPath = `${window.location.origin}/dashboard-l/embedded${path}${queryString}`;
          window.location.href = fullPath;
        };
        break;
      case AuthModeTypeEnum.Base:
        push = (path: string, query?: Record<string, string>) =>
          router.push({ pathname: path, query });
        break;
      default:
        assertUnreachable(authContext);
    }
    return { push };
  }, [authContext, router]);
  return universalRouter;
}
