import { getUserDataSource, AgentSessionEntity } from "@/lib/entities";
import { AgentSessionInfo } from "@/lib/types";

interface RouteContext {
  params: Promise<{
    name: string;
  }>;
}

/**
 * GET /api/agent/[name]/session
 * 
 * Returns all sessions for a specific agent type.
 * Sessions are ordered by most recently updated first.
 */
export async function GET(req: Request, { params }: RouteContext) {
  const { name } = await params;

  // Get the user data source
  const dataSource = await getUserDataSource();
  const sessionRepo = dataSource.getRepository(AgentSessionEntity);

  // Get all sessions, ordered by most recent first
  // Exclude uiMessages field for performance - it can be very large
  const sessions = await sessionRepo.find({
    select: ["id", "title", "hasActiveStream", "agentName", "agentConfig", "createdAt", "updatedAt"],
    order: {
      updatedAt: "DESC"
    }
  });

  // Transform to AgentSessionInfo
  const sessionInfos: AgentSessionInfo[] = sessions.map(session => ({
    id: session.id,
    title: session.title,
    hasProject: false, // Project is not stored in session entity
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }));

  return Response.json({
    agentName: name,
    sessions: sessionInfos,
    total: sessionInfos.length
  });
}

