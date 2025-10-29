import { NextResponse } from "next/server";

import { getUserDataSource } from "@/lib/entities";
import { APIError } from "@/lib/errors";
import { ReportStore } from "@/lib/report";
import { withAPIErrorHandler } from "@/lib/util/api-utils";

async function handler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    throw new APIError("Report bundle ID is required", 400);
  }

  const dataSource = await getUserDataSource();
  const reportStore = new ReportStore({ dataSource });
  
  const reportBundle = await reportStore.get({ id });

  if (!reportBundle) {
    throw new APIError(`Report bundle not found: ${id}`, 404);
  }

  return NextResponse.json({
    id: reportBundle.id,
    bundle: reportBundle.bundle,
    createdAt: reportBundle.createdAt
  });
}

export const GET = withAPIErrorHandler(handler);

