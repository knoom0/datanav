import { NextResponse, type NextRequest } from "next/server";

import { getConfig } from "@/lib/config";
import { HOSTING_ENABLED_COOKIE } from "@/lib/consts";
import { createClient } from "@/lib/supabase/server";

export async function middleware(request: NextRequest) {
  const config = getConfig();
  const hostingEnabled = config.hosting.enabled;
  
  // Create base response
  const response = NextResponse.next({
    request,
  });
  
  // Set hosting status cookie so client components can access it
  response.cookies.set(HOSTING_ENABLED_COOKIE, String(hostingEnabled), {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  
  // If hosting is disabled, skip authentication checks entirely
  if (!hostingEnabled) {
    return response;
  }

  const supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = await createClient({ request, response: supabaseResponse })

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect routes that require authentication
  const protectedPaths = ["/chat", "/components", "/data"]
  const isProtectedPath = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    // Redirect to login page
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    url.searchParams.set("redirectTo", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object instead of the supabaseResponse object

  // Copy hosting cookie to supabaseResponse
  supabaseResponse.cookies.set(HOSTING_ENABLED_COOKIE, String(hostingEnabled), {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
