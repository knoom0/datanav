# Scripts

Command-line scripts for running agents and utilities.

## Strategist

The Strategist is a meta-agent that develops and refines strategies for other agents. It uses the `AgentInvokeTool` to test strategies by invoking a target agent, evaluates the results, and iteratively improves the strategy.

### Usage

```bash
npm run strategist -- <AgentClassName> <prompt>
```

### Arguments

- `<AgentClassName>`: The class name of the target agent to develop a strategy for
  - Supported: `PlanGen`, `DataDiscoveryAgent`, `QueryGen`, `ReportingAgent`, `DesignGen`
- `<prompt>`: Description of what strategy you want to develop

### Examples

Develop a strategy for creating comprehensive PRDs:

```bash
npm run strategist -- PlanGen "Develop a strategy for creating comprehensive PRDs that focus on user needs and data requirements"
```

Develop a strategy for data discovery:

```bash
npm run strategist -- DataDiscoveryAgent "Create a strategy for efficiently discovering and understanding available data sources"
```

Develop a strategy for query generation:

```bash
npm run strategist -- QueryGen "Develop a strategy for generating efficient SQL queries that handle complex analytical questions"
```

### Output

The script will:

1. Initialize the database connection and target agent
2. Create a Strategist meta-agent
3. Stream the strategy development process to stdout in real-time
4. Display the final developed strategy

Example output:

```
=== Strategist CLI ===
Target Agent: PlanGen
Prompt: Develop a strategy for creating comprehensive PRDs

Starting strategy development...

[Agent thinking and work streamed here...]

[Step 1 completed]
[Step 2 completed]

=== Strategy Development Complete ===

=== Final Strategy ===

[Your developed strategy text here...]
```

### How It Works

The Strategist:
1. Takes your prompt and understands the goal
2. Develops an initial strategy
3. Uses `AgentInvokeTool` to test the strategy by invoking the target agent
4. Uses `GEvalTool` to evaluate the output quality
5. Iteratively refines the strategy based on evaluation feedback
6. Stores the final strategy in the project

### Requirements

- Valid OpenAI/Anthropic API key in environment variables
- PostgreSQL database connection configured:
  - `POSTGRES_HOST` (default: localhost)
  - `POSTGRES_PORT` (default: 5432)
  - `POSTGRES_USER` (default: postgres)
  - `POSTGRES_PASSWORD`
  - `POSTGRES_DATABASE` (default: datanav)

### Advanced Usage

You can also run the script directly with tsx:

```bash
npx tsx scripts/strategist.ts PlanGen "Your prompt"
```

Or make it executable and run directly:

```bash
chmod +x scripts/strategist.ts
./scripts/strategist.ts PlanGen "Your prompt"
```

## Future Scripts

More CLI tools will be added here as needed:
- Data loader utilities
- Evaluation runners
- Batch processing tools

## Development

When adding new scripts:

1. Use TypeScript and the `.ts` extension
2. Add a shebang: `#!/usr/bin/env tsx`
3. Register in package.json scripts
4. Document usage here
5. Include Commander.js for argument parsing
