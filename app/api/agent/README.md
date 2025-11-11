# Unified Agent Chat API

## Overview

The unified agent chat API provides a consistent interface for interacting with different agent types. All agents automatically benefit from session persistence via `AgentSession`.

## Endpoints

### Create Session

```
PUT /api/agent/[name]/session
```

**Path Parameters:**
- `name` - The type of agent to use (chatbot, strategist, dashbot)

**Request Body:**
```typescript
{
  config?: Record<string, any>  // Optional agent configuration
}
```

**Response:**
```typescript
{
  agentName: string;
  sessionId: string;  // Generated UUID
  createdAt: string;  // ISO date string
}
```

**Note:** This endpoint creates a new agent session with optional configuration. The session ID is automatically generated. Use this when you need to create a session with specific agent configuration before starting a chat.

---

### Chat with Agent

```
POST /api/agent/[name]/session/[sessionId]/chat
```

**Path Parameters:**
- `name` - The type of agent to use (chatbot, strategist, dashbot)
- `sessionId` - Unique identifier for the conversation session

**Request Body:**
```typescript
{
  messages: TypedUIMessage[];  // Array of conversation messages
  config?: Record<string, any>; // Optional agent configuration
}
```

**Response:** Streaming response with UI message chunks.

**Note:** The `config` parameter allows you to pass agent-specific configuration for each request. If not provided, defaults to empty config.

---

### List Sessions

```
GET /api/agent/[name]/session
```

**Path Parameters:**
- `name` - The type of agent (chatbot, strategist, dashbot)

**Response:**
```typescript
{
  agentName: string;
  sessions: AgentSessionInfo[];
  total: number;
}

interface AgentSessionInfo {
  id: string;
  title: string | null;
  hasProject: boolean;
  createdAt: string;  // ISO date string
  updatedAt: string;  // ISO date string
}
```

---

### Get Session Messages

```
GET /api/agent/[name]/session/[sessionId]/messages
```

**Path Parameters:**
- `name` - The type of agent (chatbot, strategist, dashbot)
- `sessionId` - Session identifier

**Response:**
```typescript
{
  agentName: string;
  sessionId: string;
  messages: ModelMessage[];        // Completed messages
  lastMessage: ModelMessage | null; // Currently streaming message (if any)
  hasProject: boolean;
  createdAt: string;  // ISO date string
  updatedAt: string;  // ISO date string
}
```

**Note:** If a message is currently being streamed, it will be in `lastMessage` and not yet in the `messages` array.

## Supported Agents

### Chatbot
Creates reports and analyzes data based on user queries.

**Example:**
```bash
POST /api/agent/chatbot/session/session-123/chat
```

### Strategist
Develops and refines strategies for target agents.

**Example:**
```bash
POST /api/agent/strategist/session/session-456/chat
```

### Dashbot
Creates interactive dashboards (requires ProjectConfig in future implementation).

**Example:**
```bash
POST /api/agent/dashbot/session/session-789/chat
```

## Session Persistence

All agents automatically persist conversation state in the user database:
- **messages** - Stored in `AgentSessionEntity.messages` (user sends all messages including history)
- **lastMessage** - Streaming messages are efficiently stored separately in `AgentSessionEntity.lastMessage`
- **project** - Project state (including artifacts) is stored in `AgentSessionEntity.project`
- Updates occur every 500ms during streaming
- Final message is merged into `messages` array on completion
- Projects are loaded from sessions on subsequent requests

### Project Management

Projects are stored in agent sessions and automatically loaded:
1. First request creates a new project based on the user's prompt
2. Subsequent requests load the existing project from the session
3. Project artifacts (PRDs, designs, queries, etc.) are persisted across requests
4. No need to extract projects from message annotations

## Implementation Details

### Agent Registration System

The API uses a registration system for managing agent classes:

```typescript
// From lib/meta-agent/index.ts
export function registerAgentClass(params: {
  name: string;
  factory: AgentFactory;
}): void;

export async function createAgent(params: {
  name: string;
  project: Project;
  config: Record<string, any>;
}): Promise<EvoAgent>;
```

Built-in agents (chatbot, dashbot, strategist) are automatically registered. Custom agents can be registered using `registerAgentClass`.

### AgentSession Factory Methods

`AgentSession` provides two factory methods:

1. **AgentSession.create()** - For creating new sessions with configuration
   - Takes agent name, config, session ID, and data source
   - Creates agent instance with provided config
   - Used by PUT and POST endpoints

2. **AgentSession.get()** - For readonly operations
   - Takes only agent name, session ID, and data source
   - Creates agent with default/empty config
   - Used by GET endpoints (messages, etc.)

### Session and Project Loading

When streaming a chat response, `AgentSession`:
1. Re-creates the agent with current config (ensures fresh instance)
2. Loads the project from the session (or creates new if doesn't exist)
3. Sets the loaded project on the agent
4. Streams the agent's response
5. Persists messages and project state incrementally

### Session Handler

Each agent is wrapped with `AgentSession` which:
1. Saves incoming messages to the database (client sends all messages)
2. Saves the project state (including all artifacts)
3. Streams the response while saving incrementally to `lastMessage`
4. Merges the final message into the conversation history
5. Updates the project with any new artifacts

### Stream Completion Guarantee

The API uses `.tee()` to fork the stream and Next.js `after()` to ensure completion:
- One stream copy is sent to the client
- Another copy is consumed in the background
- Even if the client disconnects, the stream completes
- Database updates and callbacks execute reliably

### Error Handling

- Invalid agent names return a 500 error with supported agent list
- Missing required config (e.g., ProjectConfig for Dashbot) returns a 500 error
- Stream errors are logged and propagated to the client

## Migration from Legacy APIs

The unified API replaces:
- `/api/chatbot/chat/[sessionId]` → `/api/agent/chatbot/session/[sessionId]/chat` ✅ Migrated
- `/api/strategist/chat/[sessionId]` → `/api/agent/strategist/session/[sessionId]/chat`
- `/api/dashbot/chat/[sessionId]` → `/api/agent/dashbot/session/[sessionId]/chat`

## Future Enhancements

- [ ] Support ProjectConfig in request body for Dashbot
- [ ] Add support for custom agent configurations
- [ ] Implement agent capability discovery endpoint
- [ ] Add session deletion endpoint
- [ ] Add session update endpoint (e.g., rename, archive)
- [ ] Add pagination for session list
- [ ] Add filtering options (by date, by agent type)

