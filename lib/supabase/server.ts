import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

interface CreateClientOptions {
  request?: NextRequest
  response?: NextResponse
}

type CookieHandler = {
  getAll: () => { name: string; value: string }[]
  setAll: (cookiesToSet: Array<{ name: string; value: string; options?: any }>) => void
}

function createMiddlewareCookieHandler(request: NextRequest, response: NextResponse): CookieHandler {
  return {
    getAll() {
      return request.cookies.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options)
      )
    },
  }
}

async function createServerCookieHandler(): Promise<CookieHandler> {
  const cookieStore = await cookies()
  
  return {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      } catch {
        // The `setAll` method was called from a Server Component.
        // This can be ignored if you have middleware refreshing
        // user sessions.
      }
    },
  }
}

export async function createClient(options: CreateClientOptions = {}) {
  const { request, response } = options

  // Determine the appropriate cookie handler based on context
  const cookieHandler = request && response 
    ? createMiddlewareCookieHandler(request, response)
    : await createServerCookieHandler()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieHandler }
  )
}
