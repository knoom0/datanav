import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { ReportBundleEntity } from "@/lib/entities";
import { ReportStore } from "@/lib/report/store";
import { getTestDataSource } from "@/lib/util/test-util";

describe("ReportStore", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let store: ReturnType<typeof getTestDataSource> extends Promise<infer T> ? ReportStore : never;

  beforeEach(async () => {
    const dataSource = await getTestDataSource();
    store = new ReportStore({ dataSource });
  });

  afterEach(async () => {
    // Clean up test data
    const dataSource = await getTestDataSource();
    await dataSource.getRepository(ReportBundleEntity).clear();
  });

  describe("create", () => {
    it("should create a new report bundle", async () => {
      const reportBundleId = await store.create({
        bundle: {
          text: "# Test Report\n\nThis is a test report.",
          dataQueryResults: [
            {
              name: "test_query",
              description: "Test query description",
              query: "SELECT * FROM test",
              records: [{ id: 1, name: "Test" }]
            }
          ]
        }
      });

      expect(reportBundleId).toBeDefined();
      expect(typeof reportBundleId).toBe("string");

      // Verify it was saved
      const retrieved = await store.get({ id: reportBundleId });
      expect(retrieved).toBeDefined();
      expect(retrieved?.bundle.text).toContain("Test Report");
    });
  });

  describe("get", () => {
    it("should retrieve an existing report bundle", async () => {
      const reportBundleId = await store.create({
        bundle: {
          text: "# Another Report",
          dataQueryResults: []
        }
      });

      const retrieved = await store.get({ id: reportBundleId });

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(reportBundleId);
    });

    it("should return null for non-existent report bundle", async () => {
      const retrieved = await store.get({ id: "non-existent-id" });
      expect(retrieved).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete an existing report bundle", async () => {
      const reportBundleId = await store.create({
        bundle: {
          text: "# To Delete",
          dataQueryResults: []
        }
      });

      const deleted = await store.delete({ id: reportBundleId });
      expect(deleted).toBe(true);

      // Verify it's gone
      const retrieved = await store.get({ id: reportBundleId });
      expect(retrieved).toBeNull();
    });

    it("should return false when deleting non-existent report bundle", async () => {
      const deleted = await store.delete({ id: "non-existent-id" });
      expect(deleted).toBe(false);
    });
  });

  describe("toReportBundle", () => {
    it("should convert ReportBundleEntity to ReportBundle", async () => {
      const reportBundleId = await store.create({
        bundle: {
          text: "# Convert Test",
          dataQueryResults: [
            {
              name: "test_query",
              description: "Test",
              query: "SELECT 1",
              records: []
            }
          ]
        }
      });

      const entity = await store.get({ id: reportBundleId });
      expect(entity).toBeDefined();

      const artifact = ReportStore.toReportBundle(entity!);

      expect(artifact.type).toBe("report_bundle");
      expect(artifact.text).toBe("# Convert Test");
      expect(artifact.dataQueryResults).toHaveLength(1);
      expect(artifact.dataQueryResults[0].name).toBe("test_query");
    });
  });
});

