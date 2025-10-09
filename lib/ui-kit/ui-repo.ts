import "reflect-metadata";

import { UIBundleEntity, getUserDataSource } from "@/lib/data/entities";
import type { UIBundle } from "@/lib/types";

/**
 * Stores a UIBundle in the database
 * @param ui - The UIBundle to persist
 * @returns Promise<string> - The UUID of the stored UIBundle
 */
export async function putUIBundle(ui: UIBundle): Promise<string> {
  await getUserDataSource();
  let entity = await UIBundleEntity.findOneBy({ uuid: ui.uuid });
  
  if (!entity) {
    entity = new UIBundleEntity();
  }
  
  entity.uuid = ui.uuid;
  entity.type = ui.type;
  entity.sourceCode = ui.sourceCode;
  entity.compiledCode = ui.compiledCode;
  entity.sourceMap = ui.sourceMap || {};
  entity.dataSpec = ui.dataSpec;
  
  await entity.save();
  return entity.uuid;
}

/**
 * Retrieves a UIBundle from the database by UUID
 * @param uuid - The UUID of the UIBundle to retrieve
 * @returns Promise<UIBundle> - The retrieved UIBundle
 * @throws Error if UIBundle with the given UUID is not found
 */
export async function getUIBundle(uuid: string): Promise<UIBundle> {
  await getUserDataSource();
  const entity = await UIBundleEntity.findOneBy({ uuid });
  
  if (!entity) {
    throw new Error(`UIBundle with UUID ${uuid} not found`);
  }
  
  return {
    type: entity.type as "ui_bundle",
    uuid: entity.uuid,
    sourceCode: entity.sourceCode,
    compiledCode: entity.compiledCode,
    sourceMap: entity.sourceMap || {},
    dataSpec: entity.dataSpec,
  };
} 