import { generateObject } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";

import { getAgentModel } from "@/lib/agent/core/agent";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import type { DataLoaderResourceInfo } from "@/lib/types";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

interface AutofillRequest {
  resources: DataLoaderResourceInfo[];
}

/**
 * Build a prompt describing the resources to help the AI generate a name and description
 */
function buildResourcesPrompt(resources: DataLoaderResourceInfo[]): string {
  if (resources.length === 0) {
    return "No resources selected.";
  }

  const resourceDescriptions = resources.map(resource => {
    const parts = [`Resource: ${resource.name}`];
    
    if (resource.columns && resource.columns.length > 0) {
      parts.push(`Columns (${resource.columns.length}): ${resource.columns.slice(0, 10).join(", ")}${resource.columns.length > 10 ? "..." : ""}`);
    }
    
    if (resource.timestampColumns && resource.timestampColumns.length > 0) {
      parts.push(`Timestamp columns: ${resource.timestampColumns.join(", ")}`);
    }
    
    if (resource.recordCount !== undefined) {
      parts.push(`Record count: ${resource.recordCount.toLocaleString()}`);
    }
    
    return parts.join("\n");
  }).join("\n\n");

  return `The following resources are being connected:\n\n${resourceDescriptions}`;
}

/**
 * Generate connector name and description using AI based on resource information
 */
async function generateConnectorConfig(resources: DataLoaderResourceInfo[]): Promise<{ name: string; description: string }> {
  const model = getAgentModel("AutofillConfig") as any;
  
  const prompt = `${buildResourcesPrompt(resources)}

Based on the resources above, generate a concise, user-friendly name and description for this data connector.

Guidelines:
- Name: Should be short (2-4 words), descriptive, and identify the data source or purpose
- Description: Should be 1-2 sentences explaining what data is being connected and what it contains
- Be specific but concise
- Don't use technical jargon unless necessary
- Focus on what data the connector provides to the user`;

  const response = await generateObject({
    model,
    prompt,
    schema: z.object({
      name: z.string().describe("A short, descriptive name for the data connector (2-4 words)"),
      description: z.string().describe("A concise description (1-2 sentences) of what data this connector provides")
    })
  });

  return response.object;
}

async function postHandler(req: NextRequest) {
  logger.info("Auto-generating connector name and description");

  const body = await req.json() as AutofillRequest;
  
  if (!body.resources || !Array.isArray(body.resources)) {
    throw new APIError("Missing required field: resources (must be an array)", 400);
  }

  if (body.resources.length === 0) {
    throw new APIError("At least one resource is required", 400);
  }

  const { name, description } = await generateConnectorConfig(body.resources);

  logger.info(`Generated name: "${name}", description: "${description}"`);
  
  return NextResponse.json({ name, description });
}

export const POST = withAPIErrorHandler(postHandler);

