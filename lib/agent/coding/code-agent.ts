
import { LanguageModelV2 } from "@ai-sdk/provider";
import { streamText, ModelMessage, stepCountIs, type UIMessageStreamWriter } from "ai";

import { generateDataProxyInterface } from "@/components/data-proxy-client";
import { EvoAgentBase, type IterationResult, createToolsMap, type NamedTool, pipeUIMessageStream, getAgentModel, isReasoningModel } from "@/lib/agent/core/agent";
import { ProjectTool } from "@/lib/agent/tool/project-tool";
import { createTextEditorTool, TextEditorTool } from "@/lib/agent/tool/text-editor";
import { getConfig } from "@/lib/config";
import { getUserDataSource } from "@/lib/data/entities";
import logger from "@/lib/logger";
import { Project, Code, DataSpec, Design, PRD, UI_BUNDLE_PART_TYPE } from "@/lib/types";
import { UICatalogTool } from "@/lib/ui-catalog/ui-catalog";
import { compileModule } from "@/lib/ui-kit/code-compiler";
import { DesignAlignmentEval } from "@/lib/ui-kit/ui-eval";
import { previewUI, checkPreviewAvailability } from "@/lib/ui-kit/ui-tester";
import { toModelInputImage } from "@/lib/ui-kit/ui-utils";

const MAX_STEPS = 100;
const MAX_ITERATIONS = 10;
const CODE_AGENT_MAX_RETRIES = 5; // Retry count for rate limit resilience in code generation
const UI_TEST_NEEDED = "<UI TEST NEEDED>";
const CODE_FILE_NAME = "component.tsx";

function systemMessageTemplate({model, codeFileName}: {model: LanguageModelV2, codeFileName: string}): string {
  return `
You are an AI component developer.
Your task is to develop a data UI component in ${codeFileName} according to the PRD and the user-provideddesign image.
Your component can access data defined in the data specification using DataProxy interface.

<Instructions>
1. Read the PRD (Product Requirements Document) the design image to understand the full requirements
2. Read the data specification and the DataProxy interface to understand the data accessible to the component.
3. Create a list of TODOs to implement the component.
4. Implement the component step by step according to the TODOs. Use ${UICatalogTool.name} tool to search and study necessary components.
5. When all TODOs are completed, ask the user to test the UI by including "${UI_TEST_NEEDED}" in your response to get a screenshot. 
6. Check the screenshot returned by the user:
- If the component is implemented as expected and aligned with the design image, stop the process.
- If the component is not implemented as expected or has bugs, go back to step 4 and ask for the updated screenshot after you are done.
</Instructions>

<ComponentSignature>
export default function Component({ dataProxy }: { dataProxy: DataProxy }) {}
</ComponentSignature>

<Tools>
Use ${ProjectTool.name} tool to access the project artifacts including PRD and data specification.
Use ${TextEditorTool.name} tool to read and change the code.
Use ${UICatalogTool.name} tool to research and plan what components to use and how to structure the code before writing any code.
</Tools>

<DesignAlignmentCriteria>
${DesignAlignmentEval.criteria.join("\n")}
</DesignAlignmentCriteria>

<Notes>
${isReasoningModel(model) ? "" : "- Think step by step. Wrap your thinking in <reasoning> tags."}
- DO NOT create additional files. All your code must be written in ${codeFileName}.
- DO NOT spend too much time on researching components. If you can't find ones you need after several attempts, proceed to the next step.
- DO NOT finish a response until the TODOs are completed.
- All packages from ${UICatalogTool.name} tool are installed and available from the code.
- If ${TextEditorTool.name} tool indicates there is an error in the code, fix the error before proceeding.
</Notes>
`;
}

async function appendArtifactMessages({ project, messages }: { project: Project, messages: ModelMessage[] }): Promise<void> {

  const design = project.get("design") as Design | undefined;
  const dataSpec = project.get("data_spec") as DataSpec | undefined;

  if (!design) {
    throw new Error("A project must have a design artifact");
  }
  if (!dataSpec) {
    throw new Error("A project must have a data_spec artifact");
  }
  if (!design.images || design.images.length === 0) {
    throw new Error("No design image found in project");
  }

  // Convert design images to appropriate format for model input, resizing if needed
  const designImagePromises = design.images.map(async img => {
    const imageBuffer = await toModelInputImage({ image: img.imageBase64 });
    return {
      type: "image" as const,
      image: imageBuffer.toString("base64")
    };
  });
  const designImages = await Promise.all(designImagePromises);
  messages.push({
    role: "user" as const,
    content: [
      {
        type: "text" as const,
        text: "Here is the design guide image for the component:"
      },
      ...designImages
    ]
  });

  const dataProxyInterfaceCode = generateDataProxyInterface(dataSpec);
  messages.push({
    role: "user" as const,
    content: [
      {
        type: "text" as const,
        text: "Here is the DataProxy interface to be passed to the component:\n\n" + dataProxyInterfaceCode
      }
    ]
  });
}

export class CodeAgent extends EvoAgentBase {
  private model: LanguageModelV2;

  constructor({ project, model }: { project: Project, model?: LanguageModelV2 }) {
    super({ project, maxIterations: MAX_ITERATIONS });
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this) as LanguageModelV2;
    }
  }

  /**
   * Get design messages from project artifacts
   */
  async iterate({ messages, writer, iteration }: { 
    messages: ModelMessage[], 
    writer: UIMessageStreamWriter,
    iteration: number
  }  ): Promise<IterationResult> {
    // If a project does not have a PRD, a data spec, or a design image, throw an error
    const prd = this.project.get("prd") as PRD;
    const dataSpec = this.project.get("data_spec") as DataSpec;
    if (!prd || !dataSpec) {
      throw new Error("A project must have a PRD artifact");
    }
    if (iteration === 1) {
      await appendArtifactMessages({ project: this.project, messages });
    }

    // Check if preview is available before proceeding
    await checkPreviewAvailability();

    const codeFileName = CODE_FILE_NAME;
    const textEditorTool = createTextEditorTool({ 
      compileOptions: { 
        enabled: true, 
        dataSpec 
      }, 
    }) as TextEditorTool;
    let code = "";
    const existingCode = this.project.get("code") as Code | undefined;
    if (existingCode) {
      code = existingCode.sourceCode;
      logger.info("Using existing code from previous iteration");
    }
    await textEditorTool.writeFile(codeFileName, code);

    // Get the user's data source
    const dataSource = await getUserDataSource();

    const baseTools: NamedTool[] = [
      // TODO(moonk): packages should be loaded from a projectConfig.
      new UICatalogTool(Object.keys(getConfig().packages), dataSource),
      new ProjectTool(this.project),
      textEditorTool
    ];
    
    let result: any = null;
    let error: any = null;
    const res = streamText({
      model: this.model,
      messages: [
        {
          role: "system",
          content: systemMessageTemplate({model: this.model, codeFileName})
        },
        ...messages,
      ] as ModelMessage[],

      tools: createToolsMap(baseTools),

      onFinish: (finishResult: any) => {
        result = finishResult;
      },

      onError: (err) => {
        error = err;
      },

      stopWhen: stepCountIs(MAX_STEPS),
      maxRetries: CODE_AGENT_MAX_RETRIES,

      experimental_telemetry: { 
        isEnabled: true,
        functionId: `${this.constructor.name}.iterate-${iteration}`,
      }
    });
    
    await pipeUIMessageStream(res.toUIMessageStream(), writer, { omitStartFinish: true });
    
    if (error) {
      throw error;
    }

    logger.info("Code generation completed.");

    const fileContent = await textEditorTool.readFile(codeFileName);

    this.project.put({
      type: "code",
      sourceCode: fileContent
    });
    
    const uiBundle = await compileModule({ filename: codeFileName, tsCode: fileContent });
    uiBundle.dataSpec = dataSpec;
    this.project.put(uiBundle);

    await writer.write({
      type: UI_BUNDLE_PART_TYPE,
      data: uiBundle
    });

    // Preview the UI
    const screenshot = await previewUI(uiBundle, {
      width: 480,
      height: 800,
      backgroundColor: "white"
    });

    const needsUITest = (result?.text || "").includes(UI_TEST_NEEDED);
    
    if (needsUITest) {
      const image = await toModelInputImage({ image: screenshot });
      return {
        success: false,
        evaluationMessage: [
          { type: "image" as const, image: image.toString("base64") },
          { type: "text" as const, text: "UI test completed - please review the screenshot and make improvements if needed." }
        ],
        response: result
      };
    }

    logger.info("UI generation completed successfully");
    
    return {
      success: true,
      evaluationMessage: "Code successfully generated, compiled, and UI preview loaded without errors.",
      response: result
    };
  }
}
