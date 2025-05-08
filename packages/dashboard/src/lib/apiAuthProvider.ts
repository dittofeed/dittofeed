import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import { createContext, useContext } from "react";

import { useAppStorePick } from "./appStore";

export const ApiAuthContextTypeEnum = {
  Embedded: "Embedded",
  Base: "Base",
} as const;

export type ApiAuthContextType =
  (typeof ApiAuthContextTypeEnum)[keyof typeof ApiAuthContextTypeEnum];

export interface EmbeddedApiAuthContext {
  type: typeof ApiAuthContextTypeEnum.Embedded;
  token: string;
}

export interface BaseApiAuthContext {
  type: typeof ApiAuthContextTypeEnum.Base;
}

export type ApiAuthContexts = EmbeddedApiAuthContext | BaseApiAuthContext;

export const ApiAuthContext = createContext<ApiAuthContexts>({
  type: ApiAuthContextTypeEnum.Base,
});

export function useBaseApiUrl({
  licensed = false,
}: { licensed?: boolean } = {}) {
  const { apiBase } = useAppStorePick(["apiBase"]);
  const authContext = useContext(ApiAuthContext);
  switch (authContext.type) {
    case ApiAuthContextTypeEnum.Embedded:
      return `${apiBase}/api-l/embedded`;
    case ApiAuthContextTypeEnum.Base:
      if (licensed) {
        return `${apiBase}/api-l`;
      }
      return `${apiBase}/api`;
    default:
      assertUnreachable(authContext);
  }
}

export function useAuthHeaders(): Record<string, string> {
  const authContext = useContext(ApiAuthContext);
  switch (authContext.type) {
    case ApiAuthContextTypeEnum.Embedded:
      return { Authorization: `Bearer ${authContext.token}` };
    case ApiAuthContextTypeEnum.Base:
      return {};
    default:
      assertUnreachable(authContext);
  }
}
