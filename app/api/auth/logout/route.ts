import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { isHostingEnabled } from "@/lib/util/hosting"

export async function POST() {
  if (!isHostingEnabled()) {
    return NextResponse.json({ error: "Hosting features are disabled" }, { status: 404 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()

  return NextResponse.json({ message: "Logged out successfully" })
}
