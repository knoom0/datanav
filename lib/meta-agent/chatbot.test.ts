
import { Chatbot } from "@/lib/meta-agent/chatbot";
import { Project } from "@/lib/types";
import { setupTestDatabase, teardownTestDatabase, type TestDatabaseSetup } from "@/lib/util/test-util";

describe("Chatbot", () => {
  let testDbSetup: TestDatabaseSetup;
  let project: Project;

  beforeAll(async () => {
    testDbSetup = await setupTestDatabase();
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
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
