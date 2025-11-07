import { z } from "zod";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { GEval } from "@/lib/agent/core/g-eval";
import logger from "@/lib/logger";
import { ActionableError, Project } from "@/lib/types";

/**
 * Schema for GEvalTool parameters
 */
const GEvalToolSchema = z.object({
  artifactType: z.enum(["prd", "design", "data_spec", "code", "report", "strategy"]).describe("The type of artifact to evaluate"),
  input: z.string().describe("The input or context that was used to generate the artifact")
});

export type GEvalToolParams = z.infer<typeof GEvalToolSchema>;

/**
 * Tool that allows an agent to evaluate project artifacts using GEval.
 * This enables agents to assess the quality of generated artifacts and get structured feedback.
 */
export class GEvalTool extends BaseAgentTool {
  readonly name = "g_eval_tool";
  readonly description = "Evaluate a project artifact using G-Eval criteria. Returns a score (0-1) and detailed reasoning about the artifact quality.";
  readonly inputSchema = GEvalToolSchema;

  private project: Project;
  private geval: GEval;

  constructor(params: {
    project: Project;
    geval: GEval;
  }) {
    super();
    this.project = params.project;
    this.geval = params.geval;
  }

  protected async executeInternal(params: GEvalToolParams): Promise<any> {
    const { artifactType, input } = params;

    logger.info(`GEvalTool: Evaluating ${artifactType} artifact`);

    // Retrieve the artifact directly from the project
    const artifact = this.project.get(artifactType);

    if (!artifact) {
      throw new ActionableError(`No ${artifactType} artifact found in project. Please create the artifact first before evaluating it.`);
    }

    // Extract the actual output from the artifact
    let actualOutput: string;
    
    switch (artifactType) {
    case "prd":
    case "report":
    case "strategy":
      actualOutput = (artifact as any).text || "";
      break;
    
    case "code":
      actualOutput = (artifact as any).sourceCode || "";
      break;
    
    case "design":
      // For design artifacts, create a description of the images
      if ((artifact as any).images && Array.isArray((artifact as any).images)) {
        actualOutput = (artifact as any).images
          .map((img: any) => `Image: ${img.description}`)
          .join("\n");
      } else {
        actualOutput = "Design artifact with images";
      }
      break;
    
    case "data_spec":
      // For data spec, create a summary of the queries
      if ((artifact as any).queries && Array.isArray((artifact as any).queries)) {
        actualOutput = (artifact as any).queries
          .map((q: any) => `Query: ${q.name}\nDescription: ${q.description}\nSQL: ${q.query}`)
          .join("\n\n");
      } else {
        actualOutput = "Data specification with queries";
      }
      break;
    
    default:
      actualOutput = JSON.stringify(artifact);
    }

    if (!actualOutput || actualOutput.trim() === "") {
      throw new ActionableError(`Artifact ${artifactType} appears to be empty or invalid`);
    }

    // Run GEval
    const testCase = {
      input,
      actualOutput
    };

    logger.info(`GEvalTool: Running evaluation with ${this.geval.name}`);
    
    const result = await this.geval.measure(testCase);

    logger.info(`GEvalTool: Evaluation complete - score: ${result.score}`);

    return {
      success: true,
      evaluationName: this.geval.name,
      artifactType,
      score: result.score,
      reason: result.reason,
      threshold: this.geval.threshold,
      passesThreshold: result.score >= this.geval.threshold,
      criteria: this.geval.criteria
    };
  }

  /**
   * Get the GEval instance being used
   */
  getGEval(): GEval {
    return this.geval;
  }

  /**
   * Get the Project instance being used
   */
  getProject(): Project {
    return this.project;
  }
}

