import { LanguageModelV2 } from "@ai-sdk/provider";
import { streamText, ModelMessage, stepCountIs, type UIMessageStreamWriter } from "ai";

import { EvoAgentBase, type IterationResult, createToolsMap, type NamedTool, pipeUIMessageStream, getAgentModel, isReasoningModel, generateSessionContext } from "@/lib/agent/core/agent";
import { DatabaseClientTool } from "@/lib/agent/tool/db-client-tool";
import { ProjectTool } from "@/lib/agent/tool/project-tool";
import { DEFAULT_MAX_STEP } from "@/lib/consts";
import { DatabaseClient } from "@/lib/data/db-client";
import logger from "@/lib/logger";
import { Project, ProductType } from "@/lib/types";

const MAX_STEPS = DEFAULT_MAX_STEP;

function systemMessageTemplate({productType, model}: {productType: ProductType, model: LanguageModelV2}): string {
  return `
${generateSessionContext()}

  You are an expert product manager specializing in data visualization and UX design.
  When a user presents a question or a prompt, create a PRD for a ${productType} that can satisfy the user's request.

  <Instructions>
  1. Think about the user's request and what they expect from the ${productType}.
  2. Use ${DatabaseClientTool.name} to understand the data available in the database.
  3. Generate a PRD that can satisfy the user's request and use the ${ProjectTool.name} tool to store it as a 'prd' artifact type.
    - Key Requirements (up to 3 items)
    - Solution Idea
    - Data Requirements
    ${productType === "dashboard" ? "- UI Requirements\n" : ""}
  4. Give a one-line summary of your work to the user.
  </Instructions>

  <Notes>
  ${isReasoningModel(model) ? "" : "- Think step by step. Wrap your thinking in <reasoning> tags."}
  - Make an educated guess on what the user ultimately wants to know based on their question/prompt and ensure the PRD covers it comprehensively.
  - Design the ${productType} to also address trivial follow-up questions that users might have about the data presented (e.g., "What about last month?", "How does this compare to competitors?", "What"s the trend?").
  - Consider the relative timeline of data from today's date when writing the PRD. Think about what time ranges would be most relevant and meaningful for the analysis.
  - DO NOT include the actual PRD content in the response.
  - DO NOT finish a response until the PRD is generated and stored in the project.
  </Notes>
  `;
}

export class PlanGen extends EvoAgentBase {
  private model: LanguageModelV2;
  private dbClient: DatabaseClient;
  private productType: ProductType;

  constructor({model, dbClient, project, productType}: {model?: LanguageModelV2, dbClient: DatabaseClient, project: Project, productType: ProductType}) {
    super({ project, maxIterations: 1 });
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this) as LanguageModelV2;
    }
    this.dbClient = dbClient;
    this.productType = productType;
  }

  async iterate({ messages, writer, iteration }: {
    messages: ModelMessage[],
    writer: UIMessageStreamWriter,
    iteration: number
  }): Promise<IterationResult> {
    logger.info(`PlanGen.iterate with ${messages.length} messages, iteration ${iteration}`);
    
    let result: any = null;
    let error: any = null;

    const projectTool = new ProjectTool(this.project);
    const tools: NamedTool[] = [
      new DatabaseClientTool(this.dbClient),
      projectTool
    ];
    
    const res = streamText({
      model: this.model,
      messages: [
        {
          role: "system",
          content: systemMessageTemplate({productType: this.productType, model: this.model})
        },
        ...messages
      ] as ModelMessage[],
      
      tools: createToolsMap(tools),
      
      onFinish: async (finishResult: any) => {
        result = finishResult;
        // ProjectTool handles PRD storage directly, no need to read files
      },
      
      onError: (err) => {
        error = err;
      },
      
      stopWhen: stepCountIs(MAX_STEPS),
      
      experimental_telemetry: {
        isEnabled: true,
        functionId: `${this.constructor.name}.iterate-${iteration}`,
      }
    });
    
    await pipeUIMessageStream(res.toUIMessageStream(), writer, { omitStartFinish: true });
    
    if (error) {
      throw error;
    }

    const prd = this.project.get("prd");
    if (!prd) {
      throw new Error("PRD not found");
    }
    
    return {
      success: true,
      response: result
    };
  }
}
