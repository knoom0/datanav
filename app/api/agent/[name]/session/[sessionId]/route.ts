import { AgentSession } from "@/lib/agent/session";
import { getUserDataSource } from "@/lib/entities";

interface RouteContext {
  params: Promise<{
    name: string;
    sessionId: string;
  }>;
}

/**
 * DELETE /api/agent/[name]/session/[sessionId]
 * 
 * Deletes a session by ID.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { sessionId } = await params;
  
  // Get the user data source
  const dataSource = await getUserDataSource();
  
  // Get the session
  const session = await AgentSession.get({
    sessionId,
    dataSource
  });
  
  // Delete the session
  await session.delete();
  
  return Response.json({
    success: true,
    sessionId
  });
}

