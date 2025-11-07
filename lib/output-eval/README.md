# Output Evaluators

Pre-configured GEval evaluators for different types of agent outputs.

## Available Evaluators

### Report Evaluator

The `REPORT_EVAL` constant provides a pre-configured GEval for evaluating AI data analysis report outputs.

**Usage:**

```typescript
import { REPORT_EVAL } from "@/lib/output-eval/report";
import { GEvalTool } from "@/lib/agent/tool/g-eval-tool";

const gevalTool = new GEvalTool({
  project: myProject,
  geval: REPORT_EVAL
});
```

**Evaluation Criteria:**

1. **Actionable Insights** (0-5): Up to 3 high-impact, actionable insights
2. **Visual Communication** (0-5): Effective use of charts and visuals
3. **Relevance and Focus** (0-5): Content relates directly to key insights
4. **Clarity and Simplicity** (0-5): Concise, jargon-free communication
5. **Narrative Engagement** (0-5): Coherent story connecting data to insights
6. **Context Alignment** (0-5): Findings connect to user's long-term objectives

Each criterion is scored 0-5 with detailed scoring guidelines. The evaluator uses Claude Sonnet and has a threshold of 0.7.

## Creating Custom Evaluators

To create a new evaluator, follow this pattern:

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { GEval } from "@/lib/agent/core/g-eval";

export const MY_EVAL = new GEval({
  name: "My Custom Evaluator",
  model: anthropic("claude-3-7-sonnet-20250219"),
  criteria: [
    `Criterion 1 (0-5):
- Goal: What this criterion measures
- Key checks and requirements
- Scoring:
  * 5: Excellent
  * 3: Adequate
  * 1: Poor
  * 0: Missing`,
    // Add more criteria...
  ],
  threshold: 0.7
});
```

## See Also

- [GEval](../agent/core/g-eval.ts) - Core evaluation framework
- [GEvalTool](../agent/tool/g-eval-tool.ts) - Tool for using evaluators in agents
- [StrategyGen](../agent/strategizing/README.md) - Example of using evaluators in meta-agents

