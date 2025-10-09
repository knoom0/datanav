import { NextRequest } from "next/server";

import { getUIBundle } from "@/lib/ui-kit/ui-repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  if (!uuid) {
    return Response.json({ error: "UUID is required" }, { status: 400 });
  }

  const uiBundle = await getUIBundle(uuid);
  return Response.json(uiBundle);
} 