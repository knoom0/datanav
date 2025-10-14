import { DataSource } from "typeorm";

import { UIBundleEntity } from "@/lib/data/entities";
import type { UIBundle, DataSpec } from "@/lib/types";
import { setupTestDatabase, teardownTestDatabase, type TestDatabaseSetup } from "@/lib/util/test-util";

function makeTestUIBundle(uuid: string): UIBundle {
  const dataSpec: DataSpec = {
    type: "data_spec",
    queries: [
      {
        name: "testQuery",
        description: "A test query",
        query: "SELECT 1",
        sampleData: [{ foo: "bar" }],
      },
    ],
  };
  return {
    type: "ui_bundle",
    uuid,
    sourceCode: "console.log(\"source\")",
    compiledCode: "console.log(\"compiled\")",
    sourceMap: {},
    dataSpec,
  };
}

async function putUIBundle(ui: UIBundle, dataSource: DataSource): Promise<string> {
  const repository = dataSource.getRepository(UIBundleEntity);
  let entity = await repository.findOneBy({ uuid: ui.uuid });
  
  if (!entity) {
    entity = new UIBundleEntity();
  }
  
  entity.uuid = ui.uuid;
  entity.type = ui.type;
  entity.sourceCode = ui.sourceCode;
  entity.compiledCode = ui.compiledCode;
  entity.sourceMap = ui.sourceMap || {};
  entity.dataSpec = ui.dataSpec;
  
  await repository.save(entity);
  return entity.uuid;
}

async function getUIBundle(uuid: string, dataSource: DataSource): Promise<UIBundle> {
  const repository = dataSource.getRepository(UIBundleEntity);
  const entity = await repository.findOneBy({ uuid });
  
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

describe("ui-repo", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;

  beforeAll(async () => {
    testDbSetup = await setupTestDatabase();
    testDataSource = testDbSetup.dataSource;
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  });

  it("should store and retrieve a UIBundle", async () => {
    const uuid = `test-${Date.now()}`;
    const bundle = makeTestUIBundle(uuid);
    const storedUuid = await putUIBundle(bundle, testDataSource);
    expect(storedUuid).toBe(uuid);

    const retrieved = await getUIBundle(uuid, testDataSource);
    expect(retrieved).toEqual(bundle);
  });

  it("should throw if UIBundle does not exist", async () => {
    const nonExistentUuid = "non-existent-uuid";
    await expect(getUIBundle(nonExistentUuid, testDataSource)).rejects.toThrow(
      `UIBundle with UUID ${nonExistentUuid} not found`
    );
  });
}); 