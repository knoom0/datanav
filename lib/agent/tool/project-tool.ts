import { z } from "zod";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { Project, Artifact, PRD, Design, DataSpec, Code, Report, ActionableError } from "@/lib/types";

/**
 * Schema for ProjectTool parameters
 */
const ProjectToolSchema = z.object({
  operation: z.enum(["put", "get"]).describe("The operation to perform on the project"),
  artifactType: z.enum(["prd", "design", "data_spec", "code", "report"]).describe("The type of artifact to work with"),
  artifact: z.object({
    text: z.string().optional().describe("Required when putting a prd, code, or report artifact"),
    images: z.array(z.object({
      imageBase64: z.string(),
      description: z.string()
    })).optional().describe("Required when putting a design artifact"),
    dataSpec: z.object({
      queries: z.array(z.object({
        name: z.string(),
        description: z.string(),
        query: z.string(),
        columnInfos: z.array(z.object({
          name: z.string(),
          dataType: z.enum(["string", "number", "boolean", "date", "json"]),
          description: z.string().optional()
        }))
      }))
    }).optional().describe("Required when putting a data_spec artifact")
  }).optional().describe("The artifact data for put operations")
});

export type ProjectToolParams = z.infer<typeof ProjectToolSchema>;

/**
 * Tool that provides project artifact management capabilities to agents.
 * Allows agents to put (store) and get (retrieve) project artifacts like PRD, Design, DataSpec, Code, and Report.
 */
export class ProjectTool extends BaseAgentTool {
  readonly name = "project_tool";
  readonly description = "Manage project artifacts including PRD, Design, DataSpec, Code, and Report. Supports put and get operations.";
  readonly inputSchema = ProjectToolSchema;

  private project: Project;

  constructor(project: Project) {
    super();
    this.project = project;
  }

  protected async executeInternal(params: ProjectToolParams): Promise<any> {
    const { operation, artifactType, artifact } = params;

    switch (operation) {
    case "put":
      return await this.putArtifact(artifactType, artifact);
    
    case "get":
      return await this.getArtifact(artifactType);
    
    default:
      throw new ActionableError(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Store an artifact in the project
   */
  private async putArtifact(artifactType: string, artifactData: any): Promise<{ success: boolean, message: string }> {
    if (!artifactData) {
      throw new ActionableError("Artifact data is required for put operation");
    }

    // If artifactData.text is a string and includes any <reasoning> tags, strip out all <reasoning> parts and log a warning
    if (typeof artifactData.text === "string" && artifactData.text.includes("<reasoning>")) {
      artifactData.text = artifactData.text.replace(/<reasoning>.*<\/reasoning>/g, "");
      console.warn("Stripped out <reasoning> parts from artifact data");
    }

    // Validate and create the appropriate artifact type
    let artifact: Artifact;
    
    try {
      switch (artifactType) {
      case "prd":
        if (!artifactData.text) {
          throw new ActionableError("PRD artifact requires text field");
        }
        artifact = {
          type: "prd",
          text: artifactData.text
        } as PRD;
        break;
      
      case "design":
        if (!artifactData.images || !Array.isArray(artifactData.images)) {
          throw new ActionableError("Design artifact requires images array");
        }
        artifact = {
          type: "design",
          images: artifactData.images
        } as Design;
        break;
      
      case "data_spec":
        if (!artifactData.dataSpec || !artifactData.dataSpec.queries || !Array.isArray(artifactData.dataSpec.queries)) {
          throw new ActionableError("DataSpec artifact requires dataSpec with queries array");
        }
        artifact = {
          type: "data_spec",
          queries: artifactData.dataSpec.queries
        } as DataSpec;
        break;
      
      case "code":
        if (!artifactData.text) {
          throw new ActionableError("Code artifact requires text field");
        }
        artifact = {
          type: "code",
          sourceCode: artifactData.text
        } as Code;
        break;
      
      case "report":
        if (!artifactData.text) {
          throw new ActionableError("Report artifact requires text field");
        }
        artifact = {
          type: "report",
          text: artifactData.text
        } as Report;
        break;
      
      default:
        throw new ActionableError(`Unknown artifact type: ${artifactType}`);
      }

      this.project.put(artifact);
      
      return {
        success: true,
        message: `Successfully stored ${artifactType} artifact in project ${this.project.id}`
      };
      
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to store ${artifactType} artifact: ${error}`);
    }
  }

  /**
   * Retrieve an artifact from the project
   */
  private async getArtifact(artifactType: string): Promise<{ artifact: Artifact | null, found: boolean }> {
    try {
      const artifact = this.project.get(artifactType);
      
      return {
        artifact: artifact || null,
        found: !!artifact
      };
      
    } catch (error) {
      throw new ActionableError(`Failed to retrieve ${artifactType} artifact: ${error}`);
    }
  }

  /**
   * Get the project instance this tool is managing
   */
  getProject(): Project {
    return this.project;
  }
}
