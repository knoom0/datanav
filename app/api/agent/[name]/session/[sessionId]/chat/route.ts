import { createUIMessageStreamResponse, consumeStream } from "ai";
import { after, NextResponse } from "next/server";

import { AgentSession } from "@/lib/agent/session";
import { getUserDataSource } from "@/lib/entities";
import logger from "@/lib/logger";
import { TypedUIMessage } from "@/lib/types";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

interface RouteContext {
  params: Promise<{
    name: string;
    sessionId: string;
  }>;
}

/**
 * Unified agent chat API endpoint
 * 
 * This endpoint provides a consistent interface for all agent types:
 * - Creates an AgentSession which handles project loading and persistence
 * - Streams the response back to the client with guaranteed completion
 * - Uses after() to consume the stream and ensure onFinish handlers run
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { name, sessionId } = await params;
  
  const { messages: uiMessages, config = {} }: { 
    messages: TypedUIMessage[];
    config?: Record<string, any>;
  } = await req.json();

  // Get the user data source for session persistence
  const dataSource = await getUserDataSource();

  logger.info(`Creating session-wrapped ${name} agent for session: ${sessionId}`);

  // Get or create AgentSession
  const session = await AgentSession.get({
    sessionId,
    dataSource
  });

  // Stream response - chunks are saved as they flow through
  // AgentSession handles UIMessage[] to ModelMessage[] conversion internally
  const stream = await session.stream({ 
    uiMessages,
    agentName: name,
    agentConfig: config
  });

  // Fork stream: one for client, one for consumption in after()
  const [clientStream, streamToConsume] = stream.tee();

  // Use after() to consume the stream and ensure completion
  after(async () => {
    await consumeStream({ stream: streamToConsume });
  });

  return createUIMessageStreamResponse({ stream: clientStream });
}

/**
 * GET handler for resuming active streams
 * 
 * This endpoint checks if there's an active stream (uiMessageChunks) for the session.
 * If no active stream exists, returns 204 (No Content).
 * If an active stream exists, creates a UIMessageStream that:
 * - Streams existing chunks first
 * - Polls the database for new chunks until uiMessageChunks becomes null
 * - Returns the stream to the client
 * 
 * Before resuming, this handler also checks for and finalizes stale streams.
 */
async function getHandler(_req: Request, { params }: RouteContext): Promise<NextResponse> {
  const { sessionId } = await params;
  
  // Get the user data source for session persistence
  const dataSource = await getUserDataSource();
  
  // Load the session to check for stale streams
  const session = await AgentSession.get({
    sessionId,
    dataSource,
    createIfNotExists: false
  }).catch(() => null);
  
  if (!session) {
    logger.warn(`Session not found for resume: ${sessionId}`);
    return new NextResponse(null, { status: 204 });
  }
  
  // Finalize stale stream if it exists
  await session.finalizeStaleStream();
  
  // Check if there's an active stream
  if (!session.hasActiveStream()) {
    return new NextResponse(null, { status: 204 });
  }
  
  logger.info(`Resuming stream for session: ${sessionId}`);
  
  // Stream chunks from database using AgentSession method
  const stream = session.streamFromDatabase();
  
  return createUIMessageStreamResponse({ stream }) as NextResponse;
}

export const GET = withAPIErrorHandler(getHandler);

