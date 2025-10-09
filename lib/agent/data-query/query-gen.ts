import { LanguageModelV2 } from "@ai-sdk/provider";
import { streamText, type ModelMessage, type UIMessageStreamWriter, stepCountIs } from "ai";

import { EvoAgentBase, createToolsMap, IterationResult, pipeUIMessageStream, getAgentModel, isReasoningModel } from "@/lib/agent/core/agent";
import { DatabaseClientTool } from "@/lib/agent/tool/db-client-tool";
import { ProjectTool } from "@/lib/agent/tool/project-tool";
import { DatabaseClient } from "@/lib/data/db-client";
import { Project, DataSpec } from "@/lib/types";

const MAX_STEPS = 100;

function systemMessageTemplate({model}: {model: LanguageModelV2}): string {
  return `
You are a data analyst participating in a data component development project.

Your task is to generate a data spec containing SQL queries that will satisfy the data requirements in the PRD.

<Instructions>
1. Use the ${ProjectTool.name} tool to get the 'prd' artifact to read the data requirements.
2. Use the ${DatabaseClientTool.name} tool to list available tables to understand the data structure
3. Generate SQL queries that extract the data needed for the requirements from the PRD
4. Test your queries to ensure they work correctly
5. Create a DataSpec artifact with your final queries and store it in the project.
6. Give one-line summary of your work to the user.
</Instructions>

<Notes>
${isReasoningModel(model) ? "" : "- Think step by step. Wrap your thinking in <reasoning> tags."}
- Plan your queries before writing them.
- When querying database, always double-quote column names.
- Minimize redundant queries. The frontend code can handle basic data operations like filtering, sorting, and grouping over query results. 
- Make sure to handle edge cases and optimize the queries for performance.
- DO NOT include the actual query results in the response.
- You MUST include column infos when storing the data spec using the ${ProjectTool.name} tool.
</Notes>
  `;
}

export class QueryGen extends EvoAgentBase {
  private model: LanguageModelV2;
  private dbClient: DatabaseClient;
  private projectTool: ProjectTool;

  constructor({model, project, dbClient}: {model?: LanguageModelV2, project: Project, dbClient: DatabaseClient}) {
    super({ project, maxIterations: 3 });
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this) as LanguageModelV2;
    }
    this.dbClient = dbClient;
    this.projectTool = new ProjectTool(project);
  }

  async iterate({ messages, writer, iteration: _iteration }: { messages: ModelMessage[], writer: UIMessageStreamWriter, iteration: number }): Promise<IterationResult> {
    // Check if project has a PRD and raise an error if it doesn"t
    const prd = this.project.get("prd");
    if (!prd) {
      throw new Error("A project must have a PRD artifact");
    }

    const tools = createToolsMap([
      new DatabaseClientTool(this.dbClient),
      this.projectTool
    ]);

    let result: any = null;
    let error: any = null;

    const res = streamText({
      model: this.model,
      messages: [
        {
          role: "system",
          content: systemMessageTemplate({model: this.model})
        },
        ...messages
      ] as ModelMessage[],
      tools,
      onFinish: (finishResult: any) => {
        result = finishResult;
      },
      onError: (err) => {
        error = err;
      },
      stopWhen: stepCountIs(MAX_STEPS),
    });

    await pipeUIMessageStream(res.toUIMessageStream(), writer, { omitStartFinish: true });
    
    if (error) {
      throw error;
    }

    // Check if DataSpec was successfully created
    const dataSpec = this.project.get("data_spec") as DataSpec;
    if (!dataSpec) {
      return {
        success: false,
        evaluationMessage: "data spec is not stored in the project",
        response: result
      };
    }

    // Check all queries are valid and collect all errors
    const queryErrors: string[] = [];
    for (const query of dataSpec.queries || []) {
      try {
        await this.dbClient.query(query.query);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        queryErrors.push(`Query ${query.name} "${query.query}" failed with error: ${errorMessage}`);
      }
    }

    // If there are any query errors, return failure with all error messages
    if (queryErrors.length > 0) {
      return {
        success: false,
        evaluationMessage: `Some of queries in data spec are not valid:\n${queryErrors.join("\n")}`,
        response: result
      };
    }

    return {
      success: true,
      response: result
    };
  }
}
