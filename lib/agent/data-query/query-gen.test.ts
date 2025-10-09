import { createUIMessageStream, type UIMessageStreamWriter } from "ai";

import { agentStreamToMessage } from "@/lib/agent/core/agent";
import { QueryGen } from "@/lib/agent/data-query/query-gen";
import { DEFAULT_QA_MODEL } from "@/lib/consts";
import { DatabaseClient } from "@/lib/data/db-client";
import { Project, PRD, DataSpec } from "@/lib/types";
import { setupSQLiteTestDatabase, teardownSQLiteTestDatabase, getSQLiteTestDataSource } from "@/lib/util/test-util";


describe("QueryGen", () => {
  let project: Project;
  let dbClient: DatabaseClient;
  const model = DEFAULT_QA_MODEL;

  beforeAll(async () => {
    await setupSQLiteTestDatabase();
  });

  beforeEach(() => {
    project = new Project("test-project");
    dbClient = new DatabaseClient(getSQLiteTestDataSource());
  });

  afterAll(async () => {
    await teardownSQLiteTestDatabase();
  });

  it("should throw error if project has no PRD", async () => {
    const queryGen = new QueryGen({
      model,
      project, // project without PRD
      dbClient
    });

    let error: any = null;

    const stream = createUIMessageStream({
      execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
        try {
          await queryGen.iterate({
            messages: [{ role: "user", content: "Generate queries for user analytics" }],
            writer,
            iteration: 1
          });
        } catch (err) {
          error = err;
        }
      }
    });

    await agentStreamToMessage(stream);

    expect(error).toBeTruthy();
    expect(error.message).toContain("A project must have a PRD artifact");
  });

  it("should generate queries based on PRD requirements (integration test)", async () => {
    // Add a PRD to the project
    const prd: PRD = {
      type: "prd",
      text: `# User Dashboard

## Overview
Create a simple user dashboard to display basic user information.

## Data Requirements
- User profile information (id, name, email)`
    };
    project.put(prd);

    const queryGen = new QueryGen({
      model,
      project,
      dbClient
    });

    let result: any = null;
    let error: any = null;

    const stream = createUIMessageStream({
      execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
        try {
          result = await queryGen.iterate({
            messages: [{ role: "user", content: "Generate the necessary SQL queries for this analytics dashboard" }],
            writer,
            iteration: 1
          });
        } catch (err) {
          error = err;
        }
      }
    });

    await agentStreamToMessage(stream);

    // Check for errors first
    if (error) {
      throw error;
    }

    // Should complete successfully
    expect(result).toBeTruthy();
    expect(result.success).toBeTruthy();

    // Check if DataSpec was created (success condition)
    const dataSpec = project.get("data_spec") as DataSpec;
    expect(!!dataSpec).toBeTruthy();

    // TODO(moonk): verify the queries to be correct and run without errors
    for (const query of dataSpec.queries || []) {
      const result = await dbClient.query(query.query);
      expect(result).toBeTruthy();
    }
  }, 60000);
});
