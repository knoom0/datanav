# Agent Tools

Collection of tools that agents can use to perform various operations.

## Available Tools

### Core Tools

- **[ProjectTool](./project-tool.ts)**: Manage project artifacts (PRD, Design, DataSpec, Code, Report, Strategy)
- **[DatabaseClientTool](./db-client-tool.ts)**: Query and explore database tables
- **[DataConnectorTool](./data-connector-tool.ts)**: Manage data connectors and load external data

### Meta-Agent Tools

- **[GEvalTool](./g-eval-tool.ts)**: Evaluate project artifacts using G-Eval criteria


### Utility Tools

- **[TextEditorTool](./text-editor.ts)**: Edit text content with structured operations

## Tool Architecture

All tools extend `BaseAgentTool` from `@/lib/agent/core/agent`, which provides:

- Consistent error handling
- Call recording and tracking
- Standardized execute interface
- Integration with AI SDK

### Creating a New Tool

```typescript
import { z } from "zod";
import { BaseAgentTool } from "@/lib/agent/core/agent";

const MyToolSchema = z.object({
  param1: z.string().describe("Description of parameter"),
  param2: z.number().optional().describe("Optional parameter")
});

export class MyTool extends BaseAgentTool {
  readonly name = "my_tool";
  readonly description = "What this tool does";
  readonly inputSchema = MyToolSchema;

  protected async executeInternal(params: z.infer<typeof MyToolSchema>): Promise<any> {
    // Tool implementation
    return {
      success: true,
      result: "Tool output"
    };
  }
}
```

## Tool Usage

### In Agents

Tools are provided to agents through the `createToolsMap` function:

```typescript
const tools: NamedTool[] = [
  new ProjectTool(project),
  new DatabaseClientTool(dbClient),
  new GEvalTool({ projectTool, geval })
];

streamText({
  model,
  messages,
  tools: createToolsMap(tools)
});
```

### Direct Usage

Tools can also be used directly:

```typescript
const projectTool = new ProjectTool(project);

const result = await projectTool.execute({
  operation: "put",
  artifactType: "prd",
  artifact: { text: "PRD content" }
});
```

## Tool Categories

### Project Management
- `ProjectTool`: Store and retrieve project artifacts

### Data Access
- `DatabaseClientTool`: Query databases
- `DataConnectorTool`: Connect to external data sources

### Agent Orchestration
- `GEvalTool`: Evaluate agent outputs

### Content Editing
- `TextEditorTool`: Structured text editing operations

## Best Practices

1. **Clear Descriptions**: Write descriptive tool and parameter descriptions for better LLM understanding
2. **Schema Validation**: Use Zod schemas to validate all inputs
3. **Error Handling**: Return structured errors that agents can understand and act on
4. **Atomic Operations**: Keep tools focused on single responsibilities
5. **Result Structure**: Return consistent result structures (success, data, error)

## Testing

All tools should have corresponding test files (e.g., `project-tool.test.ts`) covering:
- Constructor validation
- Schema validation
- Successful operations
- Error conditions
- Edge cases

## See Also

- [Agent Core](../core/agent.ts) - Base agent and tool infrastructure
- [StrategyGen](../strategizing/README.md) - Example of using multiple tools
- [GEval](../core/g-eval.ts) - Evaluation framework used by GEvalTool

