import { readUIMessageStream } from "ai";
import { z } from "zod";

import { BaseAgentTool, type EvoAgent } from "@/lib/agent/core/agent";
import logger from "@/lib/logger";

/**
 * Schema for AgentInvokeTool parameters
 */
const AgentInvokeToolSchema = z.object({
  userMessage: z.string().describe("The message to send to the agent")
});

export type AgentInvokeToolParams = z.infer<typeof AgentInvokeToolSchema>;

/**
 * Tool that allows an agent to invoke another EvoAgent and collect its output.
 * This enables meta-agent workflows where one agent can test and evaluate the behavior of another agent.
 */
export class AgentInvokeTool extends BaseAgentTool {
  readonly name = "agent_invoke_tool";
  readonly description = "Invoke another agent with a message and collect its output. Use this to test how an agent responds to a given strategy or prompt.";
  readonly inputSchema = AgentInvokeToolSchema;

  private targetAgent: EvoAgent;

  constructor(params: { targetAgent: EvoAgent }) {
    super();
    this.targetAgent = params.targetAgent;
  }

  protected async executeInternal(params: AgentInvokeToolParams): Promise<any> {
    const { userMessage } = params;

    logger.info("AgentInvokeTool: Invoking agent with message");

    // Create a message array for the agent
    const messages = [
      {
        role: "user" as const,
        content: userMessage
      }
    ];

    // Stream the agent execution to completion
    const stream = this.targetAgent.stream({
      messages
    });

    // Collect the response message from the stream
    const messageStream = readUIMessageStream({ stream });
    let finalMessage = null;
    
    for await (const message of messageStream) {
      finalMessage = message;
    }

    // Return the response message as-is
    return {
      success: true,
      agentName: this.targetAgent.constructor.name,
      response: finalMessage
    };
  }

  /**
   * Get the target agent being invoked
   */
  getTargetAgent(): EvoAgent {
    return this.targetAgent;
  }
}
