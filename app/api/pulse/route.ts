import { NextResponse } from "next/server";

import { getUserDataSource, type PulseConfig } from "@/lib/entities";
import { PulseManager } from "@/lib/pulse/manager";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handleGET() {
  // Get data source and create pulse manager
  const dataSource = await getUserDataSource();
  const manager = new PulseManager({ dataSource });

  // Get all pulse configs
  const configs = await manager.listConfigs();

  return NextResponse.json<PulseConfig[]>(configs);
}

async function handlePOST(request: Request) {
  const body = await request.json();

  // Get data source and create pulse manager
  const dataSource = await getUserDataSource();
  const manager = new PulseManager({ dataSource });

  // Create new pulse config
  const config = await manager.createConfig({
    name: body.name,
    description: body.description,
    prompt: body.prompt,
    cron: body.cron,
    cronTimezone: body.cronTimezone,
    enabled: body.enabled ?? true
  });

  return NextResponse.json<PulseConfig>(config);
}

export const GET = withAPIErrorHandler(handleGET);
export const POST = withAPIErrorHandler(handlePOST);

