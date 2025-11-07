import { randomUUID } from "crypto";

import { AgentSession } from "@/lib/agent/session";
import { getUserDataSource, AgentSessionEntity } from "@/lib/entities";

interface RouteContext {
  params: Promise<{
    name: string;
  }>;
}

export interface AgentSessionInfo {
  id: string;
  title: string | null;
  messageCount: number;
  hasProject: boolean;
  createdAt: string;
  updatedAt: string;
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
  const sessions = await sessionRepo.find({
    order: {
      updatedAt: "DESC"
    }
  });

  // Transform to AgentSessionInfo
  const sessionInfos: AgentSessionInfo[] = sessions.map(session => ({
    id: session.id,
    title: session.title,
    messageCount: session.uiMessages?.length || 0,
    hasProject: !!session.project,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }));

  return Response.json({
    agentName: name,
    sessions: sessionInfos,
    total: sessionInfos.length
  });
}

/**
 * PUT /api/agent/[name]/session
 * 
 * Creates a new agent session with the provided configuration.
 * Returns the created session ID.
 */
export async function PUT(req: Request, { params }: RouteContext) {
  const { name } = await params;
  
  // Generate a new session ID
  const sessionId = randomUUID();
  
  // Get the user data source
  const dataSource = await getUserDataSource();
  
  // Create the AgentSession (this also saves to DB)
  await AgentSession.create({
    sessionId,
    dataSource
  });
  
  return Response.json({
    agentName: name,
    sessionId,
    createdAt: new Date().toISOString()
  });
}

