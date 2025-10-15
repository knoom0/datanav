import { DataSource } from "typeorm";
import { vi } from "vitest";

import { ReportingAgent } from "@/lib/agent/reporting/agent";
import { DatabaseClient } from "@/lib/data/db-client";
import { Project } from "@/lib/types";
import { setupTestDatabase, teardownTestDatabase, type TestDatabaseSetup } from "@/lib/util/test-util";

describe("ReportingAgent", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let dbClient: DatabaseClient;
  let project: Project;
  let agent: ReportingAgent;

  beforeAll(async () => {
    testDbSetup = await setupTestDatabase();
    testDataSource = testDbSetup.dataSource;
    dbClient = new DatabaseClient(testDataSource);
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  });

  beforeEach(() => {
    project = new Project("test project prompt");
    agent = new ReportingAgent({ project, dbClient });
  });

  describe("iterate", () => {
    it("should throw error when data_spec artifact is missing", async () => {
      const mockWriter = {
        write: vi.fn()
      };

      await expect(
        agent.iterate({
          messages: [{ role: "user", content: "Generate a report" }],
          writer: mockWriter as any,
          iteration: 1
        })
      ).rejects.toThrow("A project must have a data_spec artifact to generate a report");
    });

    it("should have prd artifact present for successful execution", async () => {
      // Add a PRD artifact to the project
      project.put({
        type: "prd",
        text: "Create a simple dashboard showing user statistics"
      });

      // Add a data_spec artifact to the project
      project.put({
        type: "data_spec",
        queries: [{
          name: "summary",
          description: "Count total records",
          query: "SELECT COUNT(*) as total FROM test_table",
          columnInfos: [{
            name: "total",
            dataType: "number",
            description: "Total count of records"
          }]
        }]
      });

      // Verify artifacts are present
      const prdArtifact = project.get("prd");
      expect(prdArtifact).toBeDefined();
      expect(prdArtifact?.type).toBe("prd");
      
      const dataSpecArtifact = project.get("data_spec");
      expect(dataSpecArtifact).toBeDefined();
      expect(dataSpecArtifact?.type).toBe("data_spec");
    });
  });
});
