import { OIDC_ID_TOKEN_COOKIE_NAME } from "isomorphic-lib/src/constants";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.AUTH_MODE !== "multi-tenant") {
    return NextResponse.next();
  }

  const token = request.cookies.get(OIDC_ID_TOKEN_COOKIE_NAME)?.value;
  if (token && !request.headers.get("authorization")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("authorization", `Bearer ${token}`);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
