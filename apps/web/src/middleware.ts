import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("atlas_token")?.value;
  const { pathname } = request.nextUrl;

  // Define public paths that don't require auth
  const isPublicPath = pathname === "/login" || pathname === "/";

  // Define protected pages requiring auth
  const isDashboardPath =
    pathname.startsWith("/home") ||
    pathname.startsWith("/deals") ||
    pathname.startsWith("/committee") ||
    pathname.startsWith("/war-room") ||
    pathname.startsWith("/portfolio") ||
    pathname.startsWith("/documents") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/property") ||
    pathname.startsWith("/district");

  if (isDashboardPath && !token) {
    // Redirect to login if trying to access protected paths without token
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isPublicPath && token) {
    // Redirect authenticated users to home
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Limit the middleware to match only relevant paths
export const config = {
  matcher: [
    "/",
    "/login",
    "/home/:path*",
    "/deals/:path*",
    "/committee/:path*",
    "/war-room/:path*",
    "/portfolio/:path*",
    "/documents/:path*",
    "/admin/:path*",
    "/property/:path*",
    "/district/:path*",
  ],
};
