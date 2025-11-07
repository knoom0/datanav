import { readUIMessageStream, convertToModelMessages, generateText, type InferUIMessageChunk, type UIMessage } from "ai";
import { DataSource } from "typeorm";

import { EvoAgentCallback, EvoAgentOnErrorCallback, UIMessageStream } from "@/lib/agent/core/agent";
import { AgentSessionEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import { createAgent } from "@/lib/meta-agent";
import { Project, TypedUIMessage } from "@/lib/types";
import { getSmallModel } from "@/lib/util/ai-util";
import { extractTextFromMessage, arrayToStream } from "@/lib/util/message-util";

// Interval for updating message chunks in database (in milliseconds)
const MESSAGE_CHUNKS_UPDATE_INTERVAL_MS = 500;

// Maximum time to wait for new chunks before considering stream stale (in milliseconds)
const STALE_STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Interval for polling database for new message chunks (in milliseconds)
const STREAM_CHUNK_POLL_INTERVAL_MS = 500;

/**
 * AgentSession wraps agent execution to provide session persistence.
 * This class handles the complete session lifecycle including:
 * - Creating and loading sessions from storage
 * - Persisting messages and project state to the database
 * - Managing streaming with incremental updates
 * 
 * Message Storage Strategy:
 * - Client is responsible for loading and sending all messages (including history)
 * - Messages are stored as UIMessage[] in the database
 * - During streaming, UIMessageChunks are saved to uiMessageChunks field
 * - This allows efficient incremental updates without re-writing the entire uiMessages array
 * - Once streaming completes (onFinish), chunks are converted to a UIMessage and merged into uiMessages array
 * 
 * Project Storage Strategy:
 * - Projects are stored with the session
 * - Projects are persisted after each streaming completion with all artifacts
 * 
 * Factory Methods:
 * - AgentSession.create() - Creates a new session with agent config and saves to DB
 * - AgentSession.get() - Loads an existing session from DB
 * 
 * Use AgentSession for executing agents with automatic persistence.
 */
export class AgentSession {
  private entity: AgentSessionEntity;
  private _project: Project;
  private dataSource: DataSource;

  private constructor(params: {
    entity: AgentSessionEntity;
    dataSource: DataSource;
  }) {
    this.entity = params.entity;
    this.dataSource = params.dataSource;
    
    // Deserialize project from entity
    if (this.entity.project) {
      const projectData = this.entity.project;
      this._project = new Project();
      
      // Restore timestamps
      if (projectData.createdAt) {
        (this._project as any).createdAt = new Date(projectData.createdAt);
      }
      if (projectData.updatedAt) {
        (this._project as any).updatedAt = new Date(projectData.updatedAt);
      }
      
      // Restore artifacts
      if (projectData.artifacts) {
        for (const artifact of Object.values(projectData.artifacts)) {
          this._project.put(artifact as any);
        }
      }
    } else {
      this._project = new Project();
    }
  }

  get project(): Project {
    return this._project;
  }

  get sessionId(): string {
    return this.entity.id;
  }


  /**
   * Create a new AgentSession and save it to the database
   * 
   * @param params.sessionId - Unique session identifier
   * @param params.dataSource - TypeORM data source for persistence
   */
  static async create(params: {
    sessionId: string;
    dataSource: DataSource;
  }): Promise<AgentSession> {
    const { sessionId, dataSource } = params;
    
    // Create a new project for this session
    const project = new Project();
    
    // Create and save the session entity to the database
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const entity = sessionRepo.create({
      id: sessionId,
      uiMessages: [],
      uiMessageChunks: null,
      title: null,
      project: {
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        artifacts: project.toJSON().artifacts
      }
    });
    await sessionRepo.save(entity);
    
    logger.info(`Created new session: ${sessionId}`);
    
    return new AgentSession({
      entity,
      dataSource
    });
  }

  /**
   * Get an existing AgentSession by loading it from the database
   * 
   * @param params.sessionId - Unique session identifier
   * @param params.dataSource - TypeORM data source for persistence
   * @param params.createIfNotExists - If true, create a new session if it doesn't exist (default: true)
   */
  static async get(params: {
    sessionId: string;
    dataSource: DataSource;
    createIfNotExists?: boolean;
  }): Promise<AgentSession> {
    const { sessionId, dataSource, createIfNotExists = true } = params;
    
    // Load the session from the database
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const entity = await sessionRepo.findOne({
      where: { id: sessionId }
    });
    
    if (!entity) {
      if (createIfNotExists) {
        // Create a new session if it doesn't exist
        return await AgentSession.create({
          sessionId,
          dataSource
        });
      }
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
   * Check if there's an active stream (uiMessageChunks exists and has content)
   */
  hasActiveStream(): boolean {
    return !!(this.entity.uiMessageChunks && this.entity.uiMessageChunks.length > 0);
  }

  /**
   * Stream uiMessageChunks from the database as a UIMessageStream.
   * Streams existing chunks first, then polls for new chunks until uiMessageChunks becomes null or timeout is reached.
   * Uses query builder to select only the uiMessageChunks field for better performance.
   * 
   * @returns UIMessageStream that yields chunks as they become available
   */
  streamFromDatabase(): UIMessageStream {
    // Capture session ID, data source, and initial chunks before creating stream
    const sessionId = this.entity.id;
    const dataSource = this.dataSource;
    const initialChunks = this.entity.uiMessageChunks || [];
    let lastChunkIndex = initialChunks.length;
    let lastChunkUpdateTime = Date.now();
    const startTime = Date.now();

    return new ReadableStream<InferUIMessageChunk<UIMessage>>({
      async start(controller) {
        // Stream existing chunks first
        for (const chunk of initialChunks) {
          controller.enqueue(chunk);
        }

        // Poll for new chunks
        let shouldClose = false;
        while (!shouldClose) {
          await new Promise(resolve => setTimeout(resolve, STREAM_CHUNK_POLL_INTERVAL_MS));

          // Check if we've exceeded max polling timeout
          const totalElapsed = Date.now() - startTime;
          if (totalElapsed > STALE_STREAM_TIMEOUT_MS) {
            logger.warn(`Max polling timeout reached for session: ${sessionId}`);
            shouldClose = true;
            break;
          }

          // Use query builder to select only uiMessageChunks field for better performance
          const sessionRepo = dataSource.getRepository(AgentSessionEntity);
          const result = await sessionRepo
            .createQueryBuilder("session")
            .select("session.uiMessageChunks", "uiMessageChunks")
            .where("session.id = :id", { id: sessionId })
            .getRawOne();

          if (!result) {
            logger.warn(`Session disappeared during polling: ${sessionId}`);
            shouldClose = true;
            break;
          }

          // If uiMessageChunks is null, stream is finished
          if (result.uiMessageChunks === null) {
            shouldClose = true;
            break;
          }

          // Stream any new chunks
          const currentChunks = result.uiMessageChunks || [];
          if (currentChunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < currentChunks.length; i++) {
              controller.enqueue(currentChunks[i]);
            }
            lastChunkIndex = currentChunks.length;
            lastChunkUpdateTime = Date.now();
          } else {
            // No new chunks - check if we've been waiting too long
            const timeSinceLastChunk = Date.now() - lastChunkUpdateTime;
            if (timeSinceLastChunk > STALE_STREAM_TIMEOUT_MS) {
              logger.warn(`No new chunks received for ${Math.round(timeSinceLastChunk / 1000)}s, stopping polling for session: ${sessionId}`);
              shouldClose = true;
              break;
            }
          }
        }

        controller.close();
      }
    });
  }

  /**
   * Finalize stale stream by converting uiMessageChunks to a message if they haven't been updated recently.
   * This method checks if uiMessageChunks exists and if updatedAt is older than STALE_STREAM_TIMEOUT_MS.
   * If stale, it converts the chunks to a UIMessage, merges it into uiMessages, and clears uiMessageChunks.
   * 
   * @returns true if stream was finalized, false otherwise
   */
  async finalizeStaleStream(): Promise<boolean> {
    // Check if there are active chunks
    if (!this.entity.uiMessageChunks || this.entity.uiMessageChunks.length === 0) {
      return false;
    }

    // Check if stream is stale based on updatedAt
    if (!this.entity.updatedAt) {
      return false;
    }

    const now = Date.now();
    const updatedAt = this.entity.updatedAt.getTime();
    const timeSinceUpdate = now - updatedAt;
   
    if (timeSinceUpdate < STALE_STREAM_TIMEOUT_MS) {
      return false;
    }

    logger.info(`Finalizing stale stream for session: ${this.entity.id} (stale for ${Math.round(timeSinceUpdate / 1000)}s)`);

    // Convert chunks to UIMessage
    const chunkStream = arrayToStream(this.entity.uiMessageChunks!);
    const messageStream = readUIMessageStream({ stream: chunkStream });
    
    let finalMessage: UIMessage | null = null;
    for await (const message of messageStream) {
      finalMessage = message;
    }

    // Update entity with final message and clear chunks
    const currentUIMessages = this.entity.uiMessages || [];
    if (finalMessage) {
      this.entity.uiMessages = [...currentUIMessages, finalMessage as TypedUIMessage];
    }
    this.entity.uiMessageChunks = null;
    await this.entity.save();

    return true;
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
   * 4. Creates a UI message stream that pipes chunks through while saving them to uiMessageChunks
   * 5. Converts chunks to a UIMessage on finish and merges into uiMessages array
   * 
   * Note: 
   * - Client is responsible for loading existing messages and including them in the request.
   * - The stream pipes chunks through directly (no forking needed).
   * - Chunks are saved incrementally to uiMessageChunks field.
   * - On finish, chunks are converted to a UIMessage and merged into uiMessages array.
   */
  async stream(params: {
    uiMessages: TypedUIMessage[];
    agentName: string;
    agentConfig: Record<string, any>;
    onFinish?: EvoAgentCallback;
    onError?: EvoAgentOnErrorCallback;
  }): Promise<UIMessageStream> {
    const { uiMessages, agentName, agentConfig, onFinish, onError } = params;

    logger.info(`Starting stream for session: ${this.entity.id}`);

    // Convert UIMessages to ModelMessages for the agent
    const messages = convertToModelMessages(uiMessages);

    // Create the agent with current project and config
    const agent = await createAgent({
      name: agentName,
      project: this._project,
      config: agentConfig
    });

    // Keep local state for uiMessages and uiMessageChunks
    let currentUIMessages = [...uiMessages];
    const uiMessageChunks: Array<InferUIMessageChunk<UIMessage>> = [];

    // Save initial uiMessages and initialize uiMessageChunks
    this.entity.uiMessages = currentUIMessages;
    this.entity.uiMessageChunks = [];
    await this.entity.save();

    // Generate title if session doesn't have one (runs asynchronously)
    if (!this.entity.title) {
      const title = await this.generateSessionTitle(currentUIMessages);
      this.entity.title = title;
      await this.entity.save();
    }

    // Get the agent stream (might be async)
    const agentStream = await agent.stream({
      messages,
      onFinish: async (finishParams) => {
        // Early return if no chunks to convert
        if (uiMessageChunks.length === 0) {
          onFinish?.(finishParams);
          return;
        }

        // Reconstruct UIMessage from chunks by creating a stream from the array
        const chunkStream = new ReadableStream<InferUIMessageChunk<UIMessage>>({
          start(controller) {
            for (const chunk of uiMessageChunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          }
        });
        const messageStream = readUIMessageStream({ stream: chunkStream });
        
        let finalMessage: UIMessage | null = null;
        for await (const message of messageStream) {
          finalMessage = message;
        }

        // Early return if conversion failed
        if (!finalMessage) {
          this.entity.uiMessageChunks = null;
          await this.entity.save();
          onFinish?.(finishParams);
          return;
        }

        // Append final message to current UI messages and save
        currentUIMessages = [...currentUIMessages, finalMessage as TypedUIMessage];
        this.entity.uiMessages = currentUIMessages;
        this.entity.uiMessageChunks = null;
        this.entity.project = {
          createdAt: this._project.createdAt,
          updatedAt: this._project.updatedAt,
          artifacts: this._project.toJSON().artifacts
        };
        await this.entity.save();

        // Call original onFinish if provided
        onFinish?.(finishParams);
      },
      onError
    });

    // Create a transform stream that pipes chunks through and saves them
    let lastUpdateTime = Date.now();

    const transformStream = new TransformStream<InferUIMessageChunk<UIMessage>, InferUIMessageChunk<UIMessage>>({
      transform: async (chunk, controller) => {
        // Pipe chunk through
        controller.enqueue(chunk);
        
        // Save chunk locally
        uiMessageChunks.push(chunk);
        
        // Periodically update uiMessageChunks in database
        const now = Date.now();
        if (now - lastUpdateTime > MESSAGE_CHUNKS_UPDATE_INTERVAL_MS) {
          this.entity.uiMessageChunks = uiMessageChunks;
          await this.entity.save();
          lastUpdateTime = now;
        }
      },
      flush: async () => {
        // Final update with all chunks
        if (uiMessageChunks.length > 0) {
          this.entity.uiMessageChunks = uiMessageChunks;
          await this.entity.save();
        }
      }
    });

    // Pipe agent stream through transform stream
    agentStream.pipeThrough(transformStream);

    return transformStream.readable;
  }
}

