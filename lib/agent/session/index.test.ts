import { ModelMessage, createUIMessageStream, consumeStream } from "ai";
import { DataSource } from "typeorm";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

import { EvoAgent, StreamParams, UIMessageStream } from "@/lib/agent/core/agent";
import { getConfig } from "@/lib/config";
import { AgentSessionEntity, getUserDataSource } from "@/lib/entities";
import { registerAgentClass } from "@/lib/meta-agent";
import { Project, TypedUIMessage } from "@/lib/types";
import { extractTextFromMessage, streamToArray } from "@/lib/util/message-util";
import { getSessionStreamKey } from "@/lib/util/redis-util";
import { setupTestRedis, teardownTestRedis, type TestRedisSetup } from "@/lib/util/test-util";

import { AgentSession } from "./index";

// Mock EvoAgent implementation for testing
class MockAgent implements EvoAgent {
  project: Project;
  public streamCallCount = 0;
  public lastMessages: ModelMessage[] = [];

  constructor(project: Project) {
    this.project = project;
  }

  chat(params: StreamParams): UIMessageStream {
    this.streamCallCount++;
    this.lastMessages = params.messages;

    // Use createUIMessageStream to create a proper UIMessageStream
    return createUIMessageStream({
      execute: async ({ writer }) => {
        // Write text delta chunks
        writer.write({ type: "text-start", id: "msg-1" });
        writer.write({ type: "text-delta", delta: "Mock response", id: "msg-1" });
        writer.write({ type: "text-end", id: "msg-1" });
      },
      onFinish: async () => {
        // Call original onFinish if provided
        params.onFinish?.({
          result: {
            response: {
              text: "Mock response"
            }
          },
          writer: {} as any
        });
      },
      onError: (error) => {
        // Call original onError if provided
        params.onError?.(error);
        return typeof error === "string" ? error : "Mock error";
      }
    });
  }
}

// Register mock agent for testing
registerAgentClass({
  name: "mock",
  factory: ({ project }) => new MockAgent(project)
});

describe("AgentSession", () => {
  let dataSource: DataSource;
  let redisSetup: TestRedisSetup;
  const sessionId = "test-session-123";
  let originalRedisUrl: string;

  beforeAll(async () => {
    // Set up Redis testcontainer
    redisSetup = await setupTestRedis();
    
    // Store original redis URL from config and override with test URL
    const config = getConfig();
    originalRedisUrl = config.redis.url;
    config.redis.url = redisSetup.url;
  }, 60000);

  afterAll(async () => {
    // Restore original redis URL in config
    const config = getConfig();
    config.redis.url = originalRedisUrl;
    
    // Clean up Redis testcontainer
    await teardownTestRedis(redisSetup);
  }, 60000);

  beforeEach(async () => {
    // Get user data source (requires authentication context in real usage)
    // For testing, we can use getUserDataSource which will use test environment
    dataSource = await getUserDataSource();

    // Clear any existing session data
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    await sessionRepo.delete({ id: sessionId });
    
    // Clear Redis test data
    const streamKey = getSessionStreamKey({ sessionId });
    await redisSetup.client.del(streamKey);
  });

  afterEach(async () => {
    // Clean up test data
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    await sessionRepo.delete({ id: sessionId });
    
    // Clear Redis test data
    const streamKey = getSessionStreamKey({ sessionId });
    await redisSetup.client.del(streamKey);
  });

  it("should create a new AgentSession and save to database", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource
    });

    expect(session).toBeDefined();
    
    // Verify it was saved to database
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const sessionEntity = await sessionRepo.findOne({ where: { id: sessionId } });
    expect(sessionEntity).toBeDefined();
  });

  it("should persist messages after streaming", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource
    });

    const userMessages: TypedUIMessage[] = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello, agent!" }]
      }
    ];

    // Stream with the session wrapper
    const stream = session.chat({
      uiMessages: userMessages
    });

    // Consume the stream
    await consumeStream({ stream });

    // Verify messages were persisted
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const sessionEntity = await sessionRepo.findOne({
      where: { id: sessionId }
    });

    expect(sessionEntity).toBeDefined();
    expect(sessionEntity?.uiMessages).toHaveLength(2); // user message + assistant message
    expect(sessionEntity?.uiMessages[0].role).toBe("user");
    expect(extractTextFromMessage(sessionEntity?.uiMessages[0] as TypedUIMessage)).toBe("Hello, agent!");
    expect(sessionEntity?.uiMessages[1].role).toBe("assistant");
    expect(extractTextFromMessage(sessionEntity?.uiMessages[1] as TypedUIMessage)).toBe("Mock response");
  });

  it("should handle new session", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource
    });

    const messages: TypedUIMessage[] = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "First message ever" }]
      }
    ];

    const stream = session.chat({
      uiMessages: messages
    });

    // Consume the stream
    await consumeStream({ stream });

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the session was created
    expect(session).toBeDefined();
  });

  it("should call onFinish callback", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource
    });

    let finishCalled = false;
    let finishResult: any = null;

    const stream = session.chat({
      uiMessages: [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "Test" }] }],
      onFinish: (params) => {
        finishCalled = true;
        finishResult = params.result;
      }
    });

    // Consume the stream
    await consumeStream({ stream });

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(finishCalled).toBe(true);
    expect(finishResult).toBeDefined();
  });

  it("should retrieve messages using getMessages()", async () => {
    // Pre-populate session with messages
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    await sessionRepo.save({
      id: sessionId,
      uiMessages: [
        {
          role: "user",
          content: "Test message"
        },
        {
          role: "assistant",
          content: "Test response"
        }
      ],
      hasActiveStream: false,
      agentName: "mock",
      agentConfig: {}
    });

    const session = await AgentSession.get({
      sessionId,
      dataSource
    });

    const messages = await session.getMessages();

    // Should return completed messages from database
    expect(messages).toHaveLength(2);
    expect(extractTextFromMessage(messages[0])).toBe("Test message");
    expect(extractTextFromMessage(messages[1])).toBe("Test response");
  });

  describe("resumeChatStream", () => {
    // Use the shared Redis setup from the parent describe block
    beforeEach(async () => {
      // Clean up Redis stream before each test
      const streamKey = getSessionStreamKey({ sessionId });
      await redisSetup.client.del(streamKey);
    });

    it("should stream initial chunks immediately", async () => {
      // Pre-populate Redis with message chunks
      const streamKey = getSessionStreamKey({ sessionId });
      
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-start", id: "msg-1" }) });
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-1", delta: "Hello" }) });
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-1", delta: " world" }) });
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-end", id: "msg-1" }) });
      // Add sentinel message to signal end of stream
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-end", data: JSON.stringify({ type: "stream-end" }) });

      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      const stream = session.resumeChatStream();

      // Collect all chunks
      const chunks = await streamToArray(stream);
      
      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({ type: "text-start", id: "msg-1" });
      expect(chunks[1]).toEqual({ type: "text-delta", id: "msg-1", delta: "Hello" });
      expect(chunks[2]).toEqual({ type: "text-delta", id: "msg-1", delta: " world" });
      expect(chunks[3]).toEqual({ type: "text-end", id: "msg-1" });
    });

    it("should stream new chunks", async () => {
      // Pre-populate Redis with initial chunks
      const streamKey = getSessionStreamKey({ sessionId });
      
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-start", id: "msg-1" }) });
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-1", delta: "Initial" }) });

      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      const stream = session.resumeChatStream();

      // Simulate adding new chunks in the background
      setTimeout(async () => {
        await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-1", delta: " more" }) });
        await redisSetup.client.xAdd(streamKey, "*", { type: "stream-end", data: JSON.stringify({ type: "stream-end" }) });
      }, 500);

      // Collect all chunks
      const chunks = await streamToArray(stream);

      // Should have received all chunks including the new ones
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: "text-start", id: "msg-1" });
      expect(chunks[1]).toEqual({ type: "text-delta", id: "msg-1", delta: "Initial" });
      expect(chunks[2]).toEqual({ type: "text-delta", id: "msg-1", delta: " more" });
    });

    it("should stop when Redis stream is finished", async () => {
      // Pre-populate Redis with initial chunk
      const streamKey = getSessionStreamKey({ sessionId });
      
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-start", id: "msg-1" }) });

      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      const stream = session.resumeChatStream();

      // Delete Redis stream after short delay to stop streaming
      setTimeout(async () => {
        await redisSetup.client.xAdd(streamKey, "*", { type: "stream-end" });
        await redisSetup.client.del(streamKey);
      }, 200);

      // Collect all chunks
      const chunks = await streamToArray(stream);

      // Should have received initial chunk and then closed
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: "text-start", id: "msg-1" });
    });

    it("should return false for hasActiveStream when stream is not active", async () => {
      const session = await AgentSession.create({
        agentName: "mock",
        agentConfig: {},
        sessionId,
        dataSource
      });

      expect(session.hasActiveStream()).toBe(false);
    });

    it("should return true for hasActiveStream when stream is active", async () => {
      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      expect(session.hasActiveStream()).toBe(true);
    });
  });

  describe("finalizeStaleStream", () => {
    // Use the shared Redis setup from the parent describe block
    beforeEach(async () => {
      // Clean up Redis stream before each test
      const streamKey = getSessionStreamKey({ sessionId });
      await redisSetup.client.del(streamKey);
    });

    it("should return false when hasActiveStream is false", async () => {
      const session = await AgentSession.create({
        agentName: "mock",
        agentConfig: {},
        sessionId,
        dataSource
      });

      const result = await session.finalizeStaleStream();

      expect(result).toBe(false);
    });

    it("should return false when stream is not stale yet", async () => {
      // Create session with active stream
      const streamKey = getSessionStreamKey({ sessionId });
      
      // Add recent chunks (current timestamp)
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-start", id: "msg-1" }) });
      await redisSetup.client.xAdd(streamKey, "*", { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-1", delta: "Hello" }) });

      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      const result = await session.finalizeStaleStream();

      expect(result).toBe(false);
      
      // Verify stream still marked as active
      const updatedEntity = await sessionRepo.findOne({ where: { id: sessionId } });
      expect(updatedEntity?.hasActiveStream).toBe(true);
    });

    it("should return true and finalize when stream is stale", async () => {
      // Create session with active stream
      const streamKey = getSessionStreamKey({ sessionId });
      
      // Add chunks with old timestamp (more than 60 seconds ago)
      // Redis xAdd accepts timestamp-sequence format for the ID
      const staleTimestamp = Date.now() - 61 * 1000; // 61 seconds ago
      await redisSetup.client.xAdd(streamKey, `${staleTimestamp}-0`, { type: "stream-chunk", data: JSON.stringify({ type: "text-start", id: "msg-1" }) });
      await redisSetup.client.xAdd(streamKey, `${staleTimestamp}-1`, { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-1", delta: "Hello" }) });
      await redisSetup.client.xAdd(streamKey, `${staleTimestamp}-2`, { type: "stream-chunk", data: JSON.stringify({ type: "text-end", id: "msg-1" }) });

      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      const result = await session.finalizeStaleStream();

      expect(result).toBe(true);
      
      // Verify stream is no longer active
      const updatedEntity = await sessionRepo.findOne({ where: { id: sessionId } });
      expect(updatedEntity?.hasActiveStream).toBe(false);
      
      // Verify message was saved
      expect(updatedEntity?.uiMessages).toHaveLength(1);
      expect(updatedEntity?.uiMessages[0].role).toBe("assistant");
      expect(extractTextFromMessage(updatedEntity?.uiMessages[0] as TypedUIMessage)).toBe("Hello");
      
      // Verify Redis stream was deleted
      const chunks = await redisSetup.client.xRange(streamKey, "-", "+");
      expect(chunks).toHaveLength(0);
    });

    it("should preserve existing messages when finalizing stale stream", async () => {
      // Create session with existing messages
      const streamKey = getSessionStreamKey({ sessionId });
      
      // Add stale chunks
      const staleTimestamp = Date.now() - 61 * 1000;
      await redisSetup.client.xAdd(streamKey, `${staleTimestamp}-0`, { type: "stream-chunk", data: JSON.stringify({ type: "text-start", id: "msg-2" }) });
      await redisSetup.client.xAdd(streamKey, `${staleTimestamp}-1`, { type: "stream-chunk", data: JSON.stringify({ type: "text-delta", id: "msg-2", delta: "New message" }) });
      await redisSetup.client.xAdd(streamKey, `${staleTimestamp}-2`, { type: "stream-chunk", data: JSON.stringify({ type: "text-end", id: "msg-2" }) });

      const sessionRepo = dataSource.getRepository(AgentSessionEntity);
      await sessionRepo.save({
        id: sessionId,
        uiMessages: [
          {
            id: "msg-1",
            role: "user",
            parts: [{ type: "text", text: "Existing message" }]
          }
        ],
        hasActiveStream: true,
        agentName: "mock",
        agentConfig: {}
      });

      const session = await AgentSession.get({
        sessionId,
        dataSource
      });

      const result = await session.finalizeStaleStream();

      expect(result).toBe(true);
      
      // Verify both messages exist
      const updatedEntity = await sessionRepo.findOne({ where: { id: sessionId } });
      expect(updatedEntity?.uiMessages).toHaveLength(2);
      expect(extractTextFromMessage(updatedEntity?.uiMessages[0] as TypedUIMessage)).toBe("Existing message");
      expect(extractTextFromMessage(updatedEntity?.uiMessages[1] as TypedUIMessage)).toBe("New message");
    });
  });
});

