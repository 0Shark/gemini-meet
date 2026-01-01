import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // In production with HTTPS, Better Auth uses __Secure- prefix
  const sessionToken = request.cookies.get("better-auth.session_token") || 
                       request.cookies.get("__Secure-better-auth.session_token");
  
  // List of public paths that don't require authentication
  const publicPaths = ["/auth/login", "/auth/signup", "/api/auth"];
  const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (!sessionToken && !isPublicPath) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (sessionToken && isPublicPath && !request.nextUrl.pathname.startsWith("/api/auth")) {
      // If user is already logged in, redirect away from login/signup
      return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files, images, etc.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
