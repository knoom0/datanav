import { readFileSync } from "fs";
import { join } from "path";

import { convertToModelMessages, createUIMessageStreamResponse } from "ai";

import logger from "@/lib/logger";
import { createDashbot } from "@/lib/meta-agent/dashbot";
import { Project, ProjectConfig } from "@/lib/types";
import { extractLastProject, extractLastPrompt, saveProject } from "@/lib/util/message-util";


/**
 * Create a default ProjectConfig with mobile settings and design reference image
 */
function createDefaultProjectConfig(): ProjectConfig {
  // TODO(moonk): Move the design reference image to the public folder.
  const designRefImagePath = join(process.cwd(), "lib/agent/coding/testdata/design_ref.png");
  const designRefImage = readFileSync(designRefImagePath);
  
  return {
    screenSize: { width: 375, height: 812 },
    deviceType: "mobile",
    designRefImage: designRefImage.buffer
  };
}


export async function POST(
  req: Request
) {
  const { messages: uiMessages } = await req.json();
  const messages = convertToModelMessages(uiMessages);

  // Extract Project object from the annotations of the last assistant message.
  // If no project exists, create one using the last user message as prompt
  const project = extractLastProject(messages) ?? new Project(extractLastPrompt(messages));

  // Create default project configuration
  const projectConfig = createDefaultProjectConfig();

  // Create Dashbot instance using factory function
  const dashbot = await createDashbot(project, projectConfig);

  const stream = dashbot.stream({
    messages,
    onFinish: ({ writer }) => {
      saveProject(project, writer);
    },
    onError: (error) => {
      logger.error(error);
    }
  });

  return createUIMessageStreamResponse({ stream });
}
