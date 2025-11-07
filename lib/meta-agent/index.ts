import { EvoAgent } from "@/lib/agent/core/agent";
import { GEval } from "@/lib/agent/core/g-eval";
import { DEFAULT_QA_MODEL } from "@/lib/consts";
import { DataCatalog } from "@/lib/data/catalog";
import { DatabaseClient } from "@/lib/data/db-client";
import { getUserDataSource } from "@/lib/entities";
import { Project, ProjectConfig } from "@/lib/types";

import { Chatbot } from "./chatbot";
import { createDashbot } from "./dashbot";
import { Strategist } from "./strategist";

/**
 * Type definition for agent class constructors
 */
export type AgentClass = new (params: any) => EvoAgent;

/**
 * Type definition for agent factory functions
 */
export type AgentFactory = (params: { project: Project; config: Record<string, any> }) => Promise<EvoAgent> | EvoAgent;

/**
 * Registry for agent classes and factory functions
 */
const agentRegistry = new Map<string, AgentFactory>();

/**
 * Register an agent class or factory function by name
 * 
 * @param params.name - The name to register the agent under (case-insensitive)
 * @param params.factory - Factory function that creates agent instances
 * 
 * @example
 * ```typescript
 * // Register a class-based agent
 * registerAgentClass({
 *   name: "MyAgent",
 *   factory: async ({ project, config }) => new MyAgent({ project, ...config })
 * });
 * 
 * // Register a factory-based agent
 * registerAgentClass({
 *   name: "CustomAgent",
 *   factory: async ({ project, config }) => {
 *     const dbClient = new DatabaseClient(await getUserDataSource());
 *     return new CustomAgent({ project, dbClient, ...config });
 *   }
 * });
 * ```
 */
export function registerAgentClass(params: {
  name: string;
  factory: AgentFactory;
}): void {
  const { name, factory } = params;
  const normalizedName = name.toLowerCase();
  agentRegistry.set(normalizedName, factory);
}

/**
 * Create an agent instance by name with configuration
 * 
 * @param params.name - The registered agent name (case-insensitive)
 * @param params.project - The project instance for the agent
 * @param params.config - Key-value configuration for the agent
 * @returns Promise resolving to the created agent instance
 * @throws Error if the agent name is not registered
 * 
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   name: "chatbot",
 *   project: myProject,
 *   config: { maxTokens: 4000 }
 * });
 * ```
 */
export async function createAgent(params: {
  name: string;
  project: Project;
  config: Record<string, any>;
}): Promise<EvoAgent> {
  const { name, project, config } = params;
  const normalizedName = name.toLowerCase();
  
  const factory = agentRegistry.get(normalizedName);
  if (!factory) {
    const availableAgents = Array.from(agentRegistry.keys()).join(", ");
    throw new Error(
      `Unknown agent name: ${name}. Available agents: ${availableAgents || "none registered"}`
    );
  }
  
  return await factory({ project, config });
}

/**
 * Get list of all registered agent names
 */
export function getRegisteredAgents(): string[] {
  return Array.from(agentRegistry.keys());
}

// Register built-in agents
registerAgentClass({
  name: "chatbot",
  factory: async ({ project, config }) => {
    const dataSource = await getUserDataSource();
    const dbClient = new DatabaseClient(dataSource);
    const dataCatalog = new DataCatalog({ dataSource });
    
    return new Chatbot({
      dbClient,
      project,
      dataCatalog
    });
  }
});

registerAgentClass({
  name: "dashbot",
  factory: async ({ project, config }) => {
    const projectConfig = config.projectConfig as ProjectConfig;
    if (!projectConfig) {
      throw new Error("ProjectConfig is required for Dashbot");
    }
    return await createDashbot(project, projectConfig);
  }
});

registerAgentClass({
  name: "strategist",
  factory: async ({ project, config }) => {
    // Get target agent config, default to chatbot
    const targetAgentName = config.targetAgent || "chatbot";
    const targetAgentConfig = config.targetAgentConfig || {};
    
    // Create target project
    const targetProject = new Project();
    
    // Create target agent
    const targetAgent = await createAgent({
      name: targetAgentName,
      project: targetProject,
      config: targetAgentConfig
    });
    
    // Create GEval evaluator
    const geval = new GEval({
      name: config.gevalName || "Strategy Quality Evaluator",
      model: config.gevalModel || DEFAULT_QA_MODEL,
      criteria: config.gevalCriteria || [
        "The output should be clear, comprehensive, and well-structured",
        "The output should address the user's question or task effectively",
        "The output should demonstrate good reasoning and decision-making"
      ],
      threshold: config.gevalThreshold || 0.7
    });
    
    return new Strategist({
      project,
      targetAgent,
      artifactType: config.artifactType || "report",
      geval
    });
  }
});

