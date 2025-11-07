import { ModelMessage } from "ai";
import { DataSource } from "typeorm";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { EvoAgent, StreamParams, UIMessageStream } from "@/lib/agent/core/agent";
import { AgentSessionEntity, getUserDataSource } from "@/lib/entities";
import { registerAgentClass } from "@/lib/meta-agent";
import { Project } from "@/lib/types";

import { AgentSession } from "./index";

// Mock EvoAgent implementation for testing
class MockAgent implements EvoAgent {
  project: Project;
  public streamCallCount = 0;
  public lastMessages: ModelMessage[] = [];

  constructor(project: Project) {
    this.project = project;
  }

  stream(params: StreamParams): UIMessageStream {
    this.streamCallCount++;
    this.lastMessages = params.messages;

    // Create a simple mock stream that returns text
    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        // Write start message
        controller.enqueue(encoder.encode("0:\"Mock response\"\n"));
        
        // Call onFinish
        params.onFinish?.({
          result: {
            response: {
              text: "Mock response"
            }
          },
          writer: {} as any
        });
        
        controller.close();
      }
    }) as any;
  }
}

// Register mock agent for testing
registerAgentClass({
  name: "mock",
  factory: ({ project }) => new MockAgent(project)
});

describe("AgentSession", () => {
  let dataSource: DataSource;
  const sessionId = "test-session-123";

  beforeEach(async () => {
    // Get user data source (requires authentication context in real usage)
    // For testing, we can use getUserDataSource which will use test environment
    dataSource = await getUserDataSource();

    // Clear any existing session data
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    await sessionRepo.delete({ id: sessionId });
  });

  afterEach(async () => {
    // Clean up test data
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    await sessionRepo.delete({ id: sessionId });
  });

  it("should create a new AgentSession and save to database", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource,
      initialPrompt: "Test prompt"
    });

    expect(session).toBeDefined();
    
    // Verify it was saved to database
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const sessionEntity = await sessionRepo.findOne({ where: { id: sessionId } });
    expect(sessionEntity).toBeDefined();
    expect(sessionEntity?.project).toBeDefined();
  });

  it("should persist messages after streaming", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource,
      initialPrompt: "Test prompt"
    });

    const userMessages: ModelMessage[] = [
      {
        role: "user",
        content: "Hello, agent!"
      }
    ];

    // Stream with the session wrapper
    const stream = await session.stream({
      messages: userMessages
    });

    // Consume the stream
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    reader.releaseLock();

    // Save the last stream
    await session.saveLastStream();

    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify messages were persisted
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const sessionEntity = await sessionRepo.findOne({
      where: { id: sessionId }
    });

    expect(sessionEntity).toBeDefined();
    expect(sessionEntity?.messages).toHaveLength(2); // user message + assistant message
    expect(sessionEntity?.messages[0].role).toBe("user");
    expect(sessionEntity?.messages[0].content).toBe("Hello, agent!");
    expect(sessionEntity?.messages[1].role).toBe("assistant");
    expect(sessionEntity?.messages[1].content).toBe("Mock response");

    // Verify project was persisted
    expect(sessionEntity?.project).toBeDefined();
  });

  it("should load existing project and use it", async () => {
    // Pre-populate session with project and messages
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    const existingProject = new Project();
    existingProject.put({
      type: "report",
      title: "Test Report",
      content: "Report content"
    } as any);

    await sessionRepo.save({
      id: sessionId,
      messages: [
        {
          role: "user",
          content: "First message"
        },
        {
          role: "assistant",
          content: "First response"
        }
      ],
      project: {
        createdAt: existingProject.createdAt,
        updatedAt: existingProject.updatedAt,
        artifacts: existingProject.toJSON().artifacts
      }
    });

    // Load the session using AgentSession.get
    const session = await AgentSession.get({
      agentName: "mock",
      sessionId,
      dataSource
    });

    // Verify the project was loaded with artifacts
    expect(session.project.toJSON().artifacts["artifact-1"]).toBeDefined();

    // Client sends all messages (including history) + new message
    const allMessages: ModelMessage[] = [
      {
        role: "user",
        content: "First message"
      },
      {
        role: "assistant",
        content: "First response"
      },
      {
        role: "user",
        content: "Second message"
      }
    ];

    // Stream with the session wrapper
    const stream = await session.stream({
      messages: allMessages
    });

    // Consume the stream
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    reader.releaseLock();

    // Save the last stream
    await session.saveLastStream();

    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify all messages were persisted (3 from client + 1 assistant response)
    const sessionEntity = await sessionRepo.findOne({
      where: { id: sessionId }
    });

    expect(sessionEntity?.messages).toHaveLength(4);
  });

  it("should handle new session", async () => {
    const session = await AgentSession.create({
      agentName: "mock",
      agentConfig: {},
      sessionId,
      dataSource,
      initialPrompt: "First message ever"
    });

    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "First message ever"
      }
    ];

    const stream = await session.stream({
      messages
    });

    // Consume the stream
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    reader.releaseLock();

    // Save the last stream
    await session.saveLastStream();

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

    const stream = await session.stream({
      messages: [{ role: "user", content: "Test" }],
      onFinish: (params) => {
        finishCalled = true;
        finishResult = params.result;
      }
    });

    // Consume the stream
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    reader.releaseLock();

    // Save the last stream
    await session.saveLastStream();

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(finishCalled).toBe(true);
    expect(finishResult).toBeDefined();
  });

  it("should retrieve merged messages using getMessages()", async () => {
    // Pre-populate session with messages
    const sessionRepo = dataSource.getRepository(AgentSessionEntity);
    await sessionRepo.save({
      id: sessionId,
      messages: [
        {
          role: "user",
          content: "Test message"
        },
        {
          role: "assistant",
          content: "Test response"
        }
      ],
      lastMessage: {
        role: "assistant",
        content: "Streaming message"
      }
    });

    const session = await AgentSession.get({
      agentName: "mock",
      sessionId,
      dataSource
    });

    const messages = await session.getMessages();

    // Should return merged messages (2 completed + 1 streaming)
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe("Test message");
    expect(messages[1].content).toBe("Test response");
    expect(messages[2].content).toBe("Streaming message");
  });
});

