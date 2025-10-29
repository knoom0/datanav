import { randomUUID } from "crypto";

import { LanguageModelV2, ImageModelV2 } from "@ai-sdk/provider";
import { observeOpenAI } from "@langfuse/openai";
import { type UIMessageStreamWriter } from "ai";
import { OpenAI, toFile } from "openai";

import { EvoAgentBase, IterationResult, getAgentModel, generateSessionContext } from "@/lib/agent/core/agent";
import { Project, PRD, ProjectConfig } from "@/lib/types";

/**
 * Custom wrapper around UIMessageStreamWriter that tracks all text content
 */
export class CustomUIMessageStreamWriter {
  private writer: UIMessageStreamWriter;
  private textContent: string[] = [];

  constructor(writer: UIMessageStreamWriter) {
    this.writer = writer;
  }

  /**
   * Writes a text part to the stream, similar to writeText function in agent.ts
   * @param text The text to write
   */
  writeTextPart(text: string): void {
    const textId = randomUUID();
    this.writer.write({ type: "text-start", id: textId });
    this.writer.write({ type: "text-delta", id: textId, delta: text });
    this.writer.write({ type: "text-end", id: textId });
    
    // Save the text content
    this.textContent.push(text);
  }

  /**
   * Returns all text content that has been written
   * @returns Concatenated string of all text content
   */
  getText(): string {
    return this.textContent.join("");
  }

  /**
   * Delegate all other UIMessageStreamWriter methods to the wrapped writer
   */
  write(chunk: any): void {
    this.writer.write(chunk);
  }
}

function systemMessageTemplate({projectConfig, prd}: {projectConfig: ProjectConfig, prd: PRD}): string {
  return `
${generateSessionContext()}

    You are a UI/UX designer participating in a UI component development project.

    Your task is to create a mock image of a data component based on the PRD requirements for the following target:
    - Target device: ${projectConfig.deviceType}
    - Screen dimensions: ${projectConfig.screenSize.width}x${projectConfig.screenSize.height}px

    <Notes>
    - Make sure the image contains the entire screen.
    - Use the attached image as a look-and-feel reference
    - Follow modern UI/UX principles and best practices
    - Include proper visual hierarchy and clear call-to-actions
    </Design Guidelines>

    <PRD>
    ${prd.text}
    </PRD>
  `;
}

export class DesignGen extends EvoAgentBase {
  private model: LanguageModelV2 | ImageModelV2;
  private projectConfig: ProjectConfig;

  constructor({
    model, 
    project, 
    projectConfig
  }: {
    model?: LanguageModelV2 | ImageModelV2;
    project: Project;
    projectConfig: ProjectConfig;
  }) {
    super({ project, maxIterations: 1 });
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this);
    }
    this.projectConfig = projectConfig;
  }

  async iterate({ writer, iteration: _iteration }: { 
    writer: UIMessageStreamWriter, 
    iteration: number 
  }): Promise<IterationResult> {
    // Check if project has a PRD and raise an error if it doesn"t
    const prd = this.project.get("prd") as PRD;
    if (!prd) {
      throw new Error("A project must have a PRD artifact");
    }

    // Use custom writer to track text content
    const customWriter = new CustomUIMessageStreamWriter(writer);

    // Generate the design image
    customWriter.writeTextPart("Generating UI design based on PRD. This may take a few minutes...");

    // TODO(moonk): Refactor to a separate function which can support different models
    const client = observeOpenAI(new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }));
    const result = await client.images.edit({
      model: "gpt-image-1",
      size: "1024x1536",  // TODO(moonk): determine size based on screen size ratio
      quality: "medium",
      output_format: "png",
      image: await toFile(this.projectConfig.designRefImage, "design-ref.png", { type: "image/png" }),
      prompt: systemMessageTemplate({ projectConfig: this.projectConfig, prd }),
    });    

    const imageBase64 = result.data?.[0]?.b64_json || "";
    if (!imageBase64) {
      throw new Error("No image generated");
    }

    // Convert imageBase64 to URL
    const imageUrl = `data:image/png;base64,${imageBase64}`;
    writer.write({ type: "file", url: imageUrl, mediaType: "image/png" });

    // Store the design artifact in the project
    this.project.put({
      type: "design",
      images: [{
        imageBase64: imageBase64,
        description: `UI design for ${this.projectConfig.deviceType} (${this.projectConfig.screenSize.width}x${this.projectConfig.screenSize.height})`
      }]
    });
    customWriter.writeTextPart(`Successfully generated and stored UI design image for ${this.projectConfig.deviceType} interface (${this.projectConfig.screenSize.width}x${this.projectConfig.screenSize.height}).`);

    return {
      success: true,
      response: {
        text: customWriter.getText()
      }
    };
  }
}
