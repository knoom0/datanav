import { vi } from "vitest";

import { PlanGen } from "@/lib/agent/planning/plan-gen";
import { DatabaseClient } from "@/lib/data/db-client";
import { Project } from "@/lib/types";

describe("PlanGen", () => {
  let planGen: PlanGen;
  let project: Project;
  let mockDbClient: DatabaseClient;

  beforeEach(() => {
    project = new Project();
    mockDbClient = {
      getTableInfo: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue([])
    } as any;

    // Use a mock model that doesn"t make real API calls
    const mockModel = {
      doStream: vi.fn(),
      provider: "mock",
      modelId: "mock-model"
    } as any;

    planGen = new PlanGen({
      model: mockModel,
      dbClient: mockDbClient,
      project,
      productType: "dashboard"
    });
  });

  test("should create PlanGen instance", () => {
    expect(planGen).toBeDefined();
    expect(planGen.project).toBe(project);
  });

  test("should extend EvoAgentBase and have iterate method", () => {
    expect(planGen).toHaveProperty("iterate");
    expect(typeof planGen.iterate).toBe("function");
    expect(planGen).toHaveProperty("chat");
    expect(typeof planGen.chat).toBe("function");
  });
});
