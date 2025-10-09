"use server";

import { getUserDataSource } from "@/lib/data/entities";
import { ComponentInfo } from "@/lib/types";
import { 
  getAllComponentInfo, 
  searchComponentInfo, 
  getPackageNames,
  getComponentCount,
  getSearchComponentCount
} from "@/lib/ui-catalog/ui-catalog";

export async function getComponentsAction({
  offset = 0,
  limit
}: {
  offset?: number;
  limit?: number;
} = {}): Promise<(ComponentInfo & { createdAt: string; updatedAt: string })[]> {
  const dataSource = await getUserDataSource();
  const components = await getAllComponentInfo({ offset, limit, dataSource });
  // Convert dates to strings for client serialization
  return components.map(component => ({
    ...component,
    createdAt: component.createdAt.toISOString(),
    updatedAt: component.updatedAt.toISOString()
  }));
}

export async function searchComponentsAction(params: {
  query?: string;
  packageName?: string;
  offset?: number;
  limit?: number;
}): Promise<(ComponentInfo & { createdAt: string; updatedAt: string })[]> {
  const dataSource = await getUserDataSource();
  const components = await searchComponentInfo({ ...params, dataSource });
  // Convert dates to strings for client serialization
  return components.map(component => ({
    ...component,
    createdAt: component.createdAt.toISOString(),
    updatedAt: component.updatedAt.toISOString()
  }));
}

export async function getPackageNamesAction(): Promise<string[]> {
  const dataSource = await getUserDataSource();
  return await getPackageNames(dataSource);
}

export async function getComponentCountAction(): Promise<number> {
  const dataSource = await getUserDataSource();
  return await getComponentCount(dataSource);
}

export async function getSearchComponentCountAction(params: {
  query?: string;
  packageName?: string;
}): Promise<number> {
  const dataSource = await getUserDataSource();
  return await getSearchComponentCount({ ...params, dataSource });
} 