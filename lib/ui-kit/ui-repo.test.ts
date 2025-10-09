import type { UIBundle, DataSpec } from "@/lib/types";
import { putUIBundle, getUIBundle } from "@/lib/ui-kit/ui-repo";

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

describe("ui-repo", () => {
  it("should store and retrieve a UIBundle", async () => {
    const uuid = `test-${Date.now()}`;
    const bundle = makeTestUIBundle(uuid);
    const storedUuid = await putUIBundle(bundle);
    expect(storedUuid).toBe(uuid);

    const retrieved = await getUIBundle(uuid);
    expect(retrieved).toEqual(bundle);
  });

  it("should throw if UIBundle does not exist", async () => {
    await expect(getUIBundle("non-existent-uuid")).rejects.toThrow("UIBundle with UUID non-existent-uuid not found");
  });
}); 