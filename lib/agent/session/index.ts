import { readUIMessageStream, convertToModelMessages, generateText, createUIMessageStream, type InferUIMessageChunk, type UIMessage } from "ai";
import { DataSource } from "typeorm";

import { EvoAgentCallback, EvoAgentOnErrorCallback, UIMessageStream, pipeUIMessageStream } from "@/lib/agent/core/agent";
import { AgentSessionEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import { createAgent } from "@/lib/meta-agent";
import { Project, TypedUIMessage } from "@/lib/types";
import { getSmallModel } from "@/lib/util/ai-util";
import { extractTextFromMessage, arrayToStream } from "@/lib/util/message-util";
import { getRedisClient, getSessionStreamKey } from "@/lib/util/redis-util";

// Maximum time to wait for new chunks before considering stream stale (in milliseconds)
const STALE_STREAM_TIMEOUT_MS = 60 * 1000; // 1 minute

// Redis message types for stream entries
// - "stream-chunk": Regular UIMessage chunks being streamed
// - "stream-end": Sentinel message to signal end of stream (allows resumeChatStream to stop without timeouts)
export type RedisStreamMessageType = "stream-chunk" | "stream-end";

/**
 * AgentSession wraps agent execution to provide session persistence.
 * This class handles the complete session lifecycle including:
 * - Creating and loading sessions from storage
 * - Persisting messages to the database
 * - Managing streaming with incremental updates
 * 
 * Message Storage Strategy:
 * - Client is responsible for loading and sending all messages (including history)
 * - Messages are stored as UIMessage[] in the database
 * - During streaming, UIMessageChunks are stored in Redis streams
 * - This allows efficient incremental updates without re-writing the database
 * - Once streaming completes (onFinish), chunks are read from Redis and converted to a UIMessage
 * - The UIMessage is then merged into uiMessages array in the database
 * 
 * Factory Methods:
 * - AgentSession.create() - Creates a new session with agent config and saves to DB
 * - AgentSession.get() - Loads an existing session from DB
 * 
 * Use AgentSession for executing agents with automatic persistence.
 */
export class AgentSession {
  private entity: AgentSessionEntity;
  private dataSource: DataSource;

  private constructor(params: {
    entity: AgentSessionEntity;
    dataSource: DataSource;
  }) {
    this.entity = params.entity;
    this.dataSource = params.dataSource;
  }

  get sessionId(): string {
    return this.entity.id;
  }

  get title(): string | null {
    return this.entity.title;
  }

  /**
   * Delete this session from the database
   */
  async delete(): Promise<void> {
    await this.entity.remove();
  }

  /**
   * Create a new AgentSession and save it to the database
   * 
   * @param params.sessionId - Unique session identifier
   * @param params.dataSource - TypeORM data source for persistence
   * @param params.agentName - The agent name for this session
   * @param params.agentConfig - The agent configuration for this session
   */
  static async create(params: {
    sessionId: string;
    dataSource: DataSource;
    agentName: string;
    agentConfig?: Record<string, any>;
  }): Promise<AgentSession> {
    const { sessionId, dataSource, agentName, agentConfig = {} } = params;
    
    // Create and save the session entity to the database
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const entity = sessionRepo.create({
      id: sessionId,
      uiMessages: [],
      hasActiveStream: false,
      title: null,
      agentName,
      agentConfig
    });
    await sessionRepo.save(entity);
    
    logger.info(`Created new session: ${sessionId} with agent: ${agentName}`);
    
    return new AgentSession({
      entity,
      dataSource
    });
  }

  /**
   * Get an existing AgentSession by loading it from the database
   * 
   * TODO: Add session ownership verification - SECURITY ISSUE
   * Currently any authenticated user can access any session by ID.
   * Need to:
   * 1. Add user_id field to AgentSessionEntity
   * 2. Accept userId parameter and filter queries by it
   * 3. Verify session ownership before returning session data
   * See GitHub Copilot review comment for details.
   * 
   * @param params.sessionId - Unique session identifier
   * @param params.dataSource - TypeORM data source for persistence
   */
  static async get(params: {
    sessionId: string;
    dataSource: DataSource;
  }): Promise<AgentSession> {
    const { sessionId, dataSource } = params;
    
    // Load the session from the database
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const entity = await sessionRepo.findOne({
      where: { id: sessionId }
    });
    
    if (!entity) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    logger.info(`Loaded session: ${sessionId}`);
    
    return new AgentSession({
      entity,
      dataSource
    });
  }

  /**
   * Get all UI messages from the session
   * Returns all completed UI messages from the entity
   */
  async getMessages(): Promise<TypedUIMessage[]> {
    return this.entity.uiMessages || [];
  }

  /**
   * Check if there's an active stream
   */
  hasActiveStream(): boolean {
    return this.entity.hasActiveStream;
  }

  /**
   * Stream uiMessageChunks from Redis as a UIMessageStream.
   * Uses Redis blocking reads to stream chunks until the stream is finished.
   * 
   * @returns UIMessageStream that yields chunks as they become available
   */
  resumeChatStream(): UIMessageStream {
    const sessionId = this.entity.id;

    return createUIMessageStream({
      execute: async ({ writer }) => {
        const redis = await getRedisClient();
        const streamKey = getSessionStreamKey({ sessionId });
        let lastMessageId = "0"; // Start from beginning

        try {
          // Keep reading chunks using blocking read, starting from beginning
          while (true) {
            // Block for up to STALE_STREAM_TIMEOUT_MS waiting for chunks
            const res = await redis.xRead(
              { key: streamKey, id: lastMessageId },
              { BLOCK: STALE_STREAM_TIMEOUT_MS }
            );

            // No chunks received - stream is finished or deleted
            if (!res || res.length === 0) {
              // Otherwise, stream is complete
              logger.info(`Stream complete for session: ${sessionId}`);
              break;
            }

            // Process chunks
            for (const streamData of res) {
              for (const message of streamData.messages) {
                // Check for sentinel message using type field (no JSON parsing needed)
                if (message.message.type === "stream-end") {
                  logger.info(`Stream end sentinel received for session: ${sessionId}`);
                  return; // Exit the execute function, ending the stream
                }
                
                const data = JSON.parse(message.message.data);
                writer.write(data);
                lastMessageId = message.id;
              }
            }
          }
        } finally {
          // Always clean up Redis connection
          await redis.quit();
        }
      },
      onError: (error) => {
        logger.error(error, `Resume stream error for session ${sessionId}`);
        return typeof error === "string" ? error : "An error occurred while resuming stream";
      }
    });
  }

  /**
   * Private method to finalize a stream by converting chunks to a UIMessage
   * and saving to the database
   */
  private async finalizeStream(params: {
    uiMessageChunks: Array<InferUIMessageChunk<UIMessage>>;
  }): Promise<void> {
    logger.info(`Finalizing stream for session: ${this.entity.id}`);

    const { uiMessageChunks } = params;

    // Reconstruct UIMessage from chunks by creating a stream from the array
    const chunkStream = arrayToStream(uiMessageChunks);
    const messageStream = readUIMessageStream({ stream: chunkStream });
    
    let finalMessage: UIMessage | null = null;
    for await (const message of messageStream) {
      finalMessage = message;
    }

    // Append final message to current UI messages and save
    if (finalMessage) {
      this.entity.uiMessages = [...this.entity.uiMessages, finalMessage as TypedUIMessage];
    }
    this.entity.hasActiveStream = false;
    await this.entity.save();

    // Delete the Redis stream
    const redis = await getRedisClient();
    try {
      const streamKey = getSessionStreamKey({ sessionId: this.entity.id });
      await redis.xAdd(streamKey, "*", { type: "stream-end" });
      await redis.del(streamKey);
      logger.info(`Finalized stream for session: ${this.entity.id}`);
    } finally {
      await redis.quit();
    }
  }

  /**
   * Finalize stale stream by converting chunks from Redis to a message if they haven't been updated recently.
   * This method checks if hasActiveStream is true and if the last entry in the Redis stream 
   * is older than STALE_STREAM_TIMEOUT_MS.
   * If stale, it reads chunks from Redis, converts them to a UIMessage, merges it into uiMessages, 
   * clears the Redis stream, and sets hasActiveStream to false.
   * 
   * @returns true if stream was finalized, false otherwise
   */
  async finalizeStaleStream(): Promise<boolean> {
    // Check if there's an active stream
    if (!this.entity.hasActiveStream) {
      return false;
    }

    // Read all chunks from Redis
    const redis = await getRedisClient();
    try {
      const streamKey = getSessionStreamKey({ sessionId: this.entity.id });
      const chunks = await redis.xRange(streamKey, "-", "+");

      // Check if stream is stale based on last chunk timestamp
      // Redis stream IDs are in format: timestamp-sequence (e.g., "1234567890123-0")
      const lastChunk = chunks[chunks.length - 1];
      const idParts = typeof lastChunk.id === "string" ? lastChunk.id.split("-") : [];
      if (idParts.length < 2 || isNaN(parseInt(idParts[0], 10))) {
        logger.warn(`Malformed Redis stream ID "${lastChunk.id}" for session: ${this.entity.id}. Cannot determine staleness.`);
        return false;
      }
      const lastChunkTimestamp = parseInt(idParts[0], 10);
      const now = Date.now();
      const timeSinceUpdate = now - lastChunkTimestamp;
     
      if (timeSinceUpdate < STALE_STREAM_TIMEOUT_MS) {
        logger.info(`Stream for session: ${this.entity.id} is not stale yet (${Math.round(timeSinceUpdate / 1000)}s old)`);
        return false;
      }

      logger.info(`Finalizing stale stream for session: ${this.entity.id} (stale for ${Math.round(timeSinceUpdate / 1000)}s)`);

      // Convert Redis stream entries to UIMessageChunks
      const uiMessageChunks: Array<InferUIMessageChunk<UIMessage>> = chunks.map(chunk => 
        JSON.parse(chunk.message.data)
      );

      // Use the shared finalization logic
      await this.finalizeStream({ uiMessageChunks });

      return true;
    } finally {
      await redis.quit();
    }
  }

  /**
   * Generate a title for the session based on the first user message from uiMessages
   * Returns null if title generation fails or no user message is found
   */
  private async generateSessionTitle(uiMessages: TypedUIMessage[]): Promise<string | null> {
    // Check if session already has a title
    if (this.entity.title) {
      return null;
    }

    // Find first user message
    const firstUserMessage = uiMessages.find(msg => msg.role === "user");
    if (!firstUserMessage) {
      return null;
    }

    const messageText = extractTextFromMessage(firstUserMessage);
    if (!messageText.trim()) {
      return null;
    }

    const result = await generateText({
      model: getSmallModel(),
      prompt: `Generate a concise title (maximum 60 characters) for a conversation that starts with this message: "${messageText}"

The title should be:
- Short and descriptive
- Capture the main topic or intent
- Not include quotes or special formatting
- Be suitable for display in a navigation menu

Return only the title, nothing else.`,
      maxOutputTokens: 50,
    });

    return result.text.trim() || null;
  }

  /**
   * Stream method that:
   * 1. Creates the agent with current config and session project
   * 2. Converts UIMessages to ModelMessages for the agent
   * 3. Saves incoming UI messages to the database (client sends all messages including history)
   * 4. Creates a UI message stream that pipes chunks through while saving them to Redis
   * 5. Converts chunks to a UIMessage on finish and merges into uiMessages array
   * 
   * Note: 
   * - Client is responsible for loading existing messages and including them in the request.
   * - Uses createUIMessageStream for better lifecycle control.
   * - Chunks are saved to Redis stream as they flow through.
   * - On finish, chunks are read from Redis, converted to a UIMessage, and merged into uiMessages array.
   */
  chat(params: {
    uiMessages: TypedUIMessage[];
    onFinish?: EvoAgentCallback;
    onError?: EvoAgentOnErrorCallback;
  }): UIMessageStream {
    const { uiMessages, onFinish, onError } = params;

    // Get agent name and config from entity
    const agentName = this.entity.agentName;
    const agentConfig = this.entity.agentConfig || {};

    if (!agentName) {
      throw new Error(`Session ${this.entity.id} does not have an agentName set`);
    }

    logger.info(`Starting chat for session: ${this.entity.id} with agent: ${agentName}`);

    // Keep local state for chunks (captured in closure)
    const uiMessageChunks: Array<InferUIMessageChunk<UIMessage>> = [];
    
    // Use createUIMessageStream for better lifecycle control
    return createUIMessageStream({
      execute: async ({ writer }) => {
        // Get Redis client and keys
        const redis = await getRedisClient();
        const streamKey = getSessionStreamKey({ sessionId: this.entity.id });

        try {
          // Clear any existing stream data
          await redis.del(streamKey);

          // Create the agent with a new project and config
          const agent = await createAgent({
            name: agentName,
            project: new Project(),
            config: agentConfig
          });

          // Keep local state for uiMessages
          const currentUIMessages = [...uiMessages];

          // Save initial uiMessages and set hasActiveStream to true
          this.entity.uiMessages = currentUIMessages;
          this.entity.hasActiveStream = true;
          await this.entity.save();

          // Generate title if session doesn't have one (runs asynchronously)
          if (!this.entity.title) {
            const title = await this.generateSessionTitle(currentUIMessages);
            if (title) {
              this.entity.title = title;
              await this.entity.save();
            }
          }

          const messages = convertToModelMessages(uiMessages);

          // Get agent stream
          const agentStream = agent.chat({
            messages,
            onFinish,
            onError
          });

          // Pipe agent stream through writer with chunk processing
          await pipeUIMessageStream({
            source: agentStream,
            target: writer,
            onChunk: async (chunk) => {
              // Save chunk to local array
              uiMessageChunks.push(chunk);
              
              // Save chunk to Redis stream with type field for efficient filtering
              await redis.xAdd(
                streamKey,
                "*",
                { 
                  type: "stream-chunk" as RedisStreamMessageType,
                  data: JSON.stringify(chunk) 
                }
              );
            }
          });

          // Write sentinel message to signal end of stream
          await redis.xAdd(
            streamKey,
            "*",
            { 
              type: "stream-end" as RedisStreamMessageType,
              data: JSON.stringify({ type: "stream-end" }) 
            }
          );
        } finally {
          await redis.quit();
        }
      },
      onFinish: async () => {
        await this.finalizeStream({ uiMessageChunks });
      },
      onError: (error) => {
        logger.error(error, `Stream error for session ${this.entity.id}`);
        
        // Write sentinel message to signal end of stream even on error (fire and forget)
        (async () => {
          const redis = await getRedisClient();
          try {
            const streamKey = getSessionStreamKey({ sessionId: this.entity.id });
            await redis.xAdd(
              streamKey,
              "*",
              { 
                type: "stream-end" as RedisStreamMessageType,
                data: JSON.stringify({ type: "stream-end" }) 
              }
            );
          } finally {
            await redis.quit();
          }
        })().catch(err => logger.error(err, "Failed to write sentinel on error"));
        
        // Finalize stream asynchronously (fire and forget)
        this.finalizeStream({ uiMessageChunks }).catch(err => 
          logger.error(err, "Failed to finalize stream after error")
        );
        return typeof error === "string" ? error : "An error occurred during streaming";
      }
    });
  }
}

