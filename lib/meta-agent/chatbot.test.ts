
import type { DataSource } from "typeorm";
import { vi } from "vitest";

import { Chatbot } from "@/lib/meta-agent/chatbot";
import { Project } from "@/lib/types";
import {
  setupSQLiteTestDatabase,
  teardownSQLiteTestDatabase
} from "@/lib/util/test-util";

let sqliteDataSource: DataSource | null = null;

vi.mock("@/lib/entities", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entities")>(
    "@/lib/entities"
  );

  return {
    ...actual,
    getUserDataSource: vi.fn(async () => {
      if (!sqliteDataSource) {
        throw new Error("SQLite test database not initialized");
      }
      return sqliteDataSource;
    })
  };
});

describe("Chatbot", () => {
  let project: Project;

  beforeAll(async () => {
    sqliteDataSource = await setupSQLiteTestDatabase();
  }, 60000);

  afterAll(async () => {
    await teardownSQLiteTestDatabase();
    sqliteDataSource = null;
  });

  beforeEach(() => {
    project = new Project("Test project");
  });

  describe("create", () => {
    it("should create a Chatbot instance with correct agents", async () => {
      const chatbot = await Chatbot.create(project);

      expect(chatbot).toBeInstanceOf(Chatbot);
      expect(chatbot.project).toBe(project);
      expect(chatbot.agents).toHaveLength(4);
      expect(chatbot.agents[0].constructor.name).toBe("DataDiscoveryAgent");
      expect(chatbot.agents[1].constructor.name).toBe("PlanGen");
      expect(chatbot.agents[2].constructor.name).toBe("QueryGen");
      expect(chatbot.agents[3].constructor.name).toBe("ReportingAgent");
    });
  });

});
