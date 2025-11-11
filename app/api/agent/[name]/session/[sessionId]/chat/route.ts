import { createUIMessageStreamResponse, consumeStream } from "ai";
import { NextResponse } from "next/server";

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
 * - Uses consumeSseStream callback to consume the stream and ensure onFinish handlers run
 */
async function postHandler(req: Request, { params }: RouteContext) {
  const { name, sessionId } = await params;
  
  const { messages: uiMessages }: { 
    messages: TypedUIMessage[];
  } = await req.json();

  // Get the user data source for session persistence
  const dataSource = await getUserDataSource();

  logger.info(`Creating session-wrapped ${name} agent for session: ${sessionId}`);

  // Get AgentSession (should already exist, created by page.tsx)
  // Security: Session ownership is enforced by getUserDataSource() which returns a user-specific
  // data source. Each user has their own isolated database schema, so sessions are inherently isolated.
  const session = await AgentSession.get({
    sessionId,
    dataSource
  });

  // Stream response - chunks are saved as they flow through
  // AgentSession handles UIMessage[] to ModelMessage[] conversion internally
  const stream = session.chat({ 
    uiMessages
  });

  // Use consumeSseStream to consume the stream and ensure completion
  return createUIMessageStreamResponse({ 
    stream,
    consumeSseStream: async ({ stream: sseStream }) => {
      await consumeStream({ stream: sseStream });
    logger.info(`Stream completed for session: ${sessionId}`);
    }
  }) as NextResponse;
}

export const POST = withAPIErrorHandler(postHandler);

/**
 * GET handler for resuming active streams
 * 
 * This endpoint checks if there's an active stream for the session.
 * If no active stream exists, returns 204 (No Content).
 * If an active stream exists, creates a UIMessageStream that:
 * - Streams existing chunks from Redis first
 * - Uses Redis blocking reads to wait for new chunks
 * - Completes when the Redis stream is deleted (indicating stream completion)
 * - Returns the stream to the client
 */
async function getHandler(_req: Request, { params }: RouteContext): Promise<NextResponse> {
  const { sessionId } = await params;
  
  // Get the user data source for session persistence
  const dataSource = await getUserDataSource();
  
  // Load the session to check for stale streams
  const session = await AgentSession.get({
    sessionId,
    dataSource,
  });
    
  // Check if there's an active stream
  if (!session.hasActiveStream()) {
    return new NextResponse(null, { status: 204 });
  }
  
  logger.info(`Resuming stream for session: ${sessionId}`);
  
  // Stream chunks from database using AgentSession method
  const stream = session.resumeChatStream();
  
  return createUIMessageStreamResponse({ stream }) as NextResponse;
}

export const GET = withAPIErrorHandler(getHandler);

