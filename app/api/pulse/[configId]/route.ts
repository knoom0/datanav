import { NextResponse } from "next/server";

import { getUserDataSource, type PulseConfig } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import { PulseManager } from "@/lib/pulse/manager";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handleGET(
  request: Request,
  { params }: { params: Promise<{ configId: string }> }
) {
  const { configId } = await params;

  if (!configId) {
    throw new APIError("Config ID is required", 400);
  }

  // Get data source and create pulse manager
  const dataSource = await getUserDataSource();
  const manager = new PulseManager({ dataSource });

  // Get the config by ID
  const config = await manager.getConfig({ id: configId });

  if (!config) {
    throw new APIError(`Pulse config not found: ${configId}`, 404);
  }

  return NextResponse.json<PulseConfig>(config);
}

async function handlePUT(
  request: Request,
  { params }: { params: Promise<{ configId: string }> }
) {
  const { configId } = await params;
  const body = await request.json();

  if (!configId) {
    throw new APIError("Config ID is required", 400);
  }

  // Get data source and create pulse manager
  const dataSource = await getUserDataSource();
  const manager = new PulseManager({ dataSource });

  // Update the config
  const config = await manager.updateConfig({
    id: configId,
    name: body.name,
    description: body.description,
    prompt: body.prompt,
    cron: body.cron,
    cronTimezone: body.cronTimezone,
    enabled: body.enabled
  });

  return NextResponse.json<PulseConfig>(config);
}

async function handleDELETE(
  request: Request,
  { params }: { params: Promise<{ configId: string }> }
) {
  const { configId } = await params;

  if (!configId) {
    throw new APIError("Config ID is required", 400);
  }

  // Get data source and create pulse manager
  const dataSource = await getUserDataSource();
  const manager = new PulseManager({ dataSource });

  // Delete the config
  await manager.deleteConfig({ id: configId });

  return NextResponse.json({ success: true });
}

export const GET = withAPIErrorHandler(handleGET);
export const PUT = withAPIErrorHandler(handlePUT);
export const DELETE = withAPIErrorHandler(handleDELETE);

