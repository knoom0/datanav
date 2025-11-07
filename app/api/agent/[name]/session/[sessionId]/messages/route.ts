import { NextResponse } from "next/server";

import { AgentSession } from "@/lib/agent/session";
import { getUserDataSource } from "@/lib/entities";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

interface RouteContext {
  params: Promise<{
    name: string;
    sessionId: string;
  }>;
}

/**
 * GET /api/agent/[name]/session/[sessionId]/messages
 * 
 * Returns all UI messages for a specific agent session as an array.
 */
async function getHandler(req: Request, { params }: RouteContext) {
  const { sessionId } = await params;

  // Get the user data source
  const dataSource = await getUserDataSource();

  // Get or create AgentSession
  const session = await AgentSession.get({
    sessionId,
    dataSource
  });

  // Finalize stale stream if it exists before returning messages
  await session.finalizeStaleStream();

  // Get messages and return as array
  const messages = await session.getMessages();
  return NextResponse.json(messages);
}

export const GET = withAPIErrorHandler(getHandler);

