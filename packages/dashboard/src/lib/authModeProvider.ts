import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { createContext, useContext } from "react";

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
