import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (
    process.env.BASE_PATH &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const pathname = `${process.env.BASE_PATH}/${request.nextUrl.pathname}`;
    return NextResponse.redirect(new URL(pathname, request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
