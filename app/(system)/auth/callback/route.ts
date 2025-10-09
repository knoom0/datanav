import { NextRequest, NextResponse } from "next/server"

import logger from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const redirectTo = searchParams.get("redirectTo") || "/chat"

  if (!code) {
    logger.error("No authorization code found in callback")
    return Response.redirect(new URL("/auth/login?error=no_code", request.url))
  }

  const response = NextResponse.redirect(new URL(redirectTo, request.url))
  const supabase = await createClient({ request, response })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    logger.error({ error: error.message }, "Error exchanging code for session")
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url))
  }

  logger.info({ redirectTo }, "Authentication successful, redirecting to")
  return response
}
