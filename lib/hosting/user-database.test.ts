import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UserDatabaseConfig } from "@/lib/hosting/entities";
import { setupUserDatabase, getUserDataSourceOptions } from "@/lib/hosting/user-database";

// Mock the config to use test database connection
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(() => ({
    packages: {},
    agent: {},
    database: {
      type: "postgres",
      host: "localhost",
      port: 5432,
      username: "test_user",
      password: "test_password",
      database: "test_db"
    }
  }))
}));

describe("User Database Functions", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer("postgres:15")
      .withDatabase("test_db")
      .withUsername("test_user") 
      .withPassword("test_password")
      .start();

    // Mock the config with container connection details
    const { getConfig } = await import("@/lib/config");
    vi.mocked(getConfig).mockReturnValue({
      agent: {},
      database: {
        type: "postgres",
        host: container.getHost(),
        port: container.getFirstMappedPort(),
        username: container.getUsername(),
        password: container.getPassword(),
        database: container.getDatabase()
      },
      hosting: {
        enabled: true,
      },
      packages: {},
    });
  }, 60000);

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  beforeEach(async () => {
    // Clean up data before each test
    const hostingDataSource = await import("@/lib/hosting/entities").then(m => m.getHostingDataSource());
    await hostingDataSource.getRepository(UserDatabaseConfig).clear();
  });

  describe("setupUserDatabase", () => {
    it("should create database and save config", async () => {
      const userId = "test-user-123";
      
      const result = await setupUserDatabase(userId);
      
      expect(result).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.databaseName).toBe(`datanav_user_${userId}`);
      expect(result.isExternal).toBe(false);
      expect(result.externalConnectionString).toBeNull();
    });
  });

  describe("getUserDataSourceOptions", () => {
    it("should return DataSource options for existing config", async () => {
      const userId = "test-user-456";
      
      // First setup the database
      await setupUserDatabase(userId);
      
      // Then get the DataSource options
      const options = await getUserDataSourceOptions(userId);
      
      expect(options).toBeDefined();
      expect(options.database).toBe(`datanav_user_${userId}`);
      expect(options.type).toBe("postgres");
    });

    it("should create database if config doesn't exist", async () => {
      const userId = "test-user-789";
      
      // Get DataSource options for non-existent user
      const options = await getUserDataSourceOptions(userId);
      
      expect(options).toBeDefined();
      expect(options.database).toBe(`datanav_user_${userId}`);
      
      // Verify config was created
      const hostingDataSource = await import("@/lib/hosting/entities").then(m => m.getHostingDataSource());
      const config = await hostingDataSource.getRepository(UserDatabaseConfig).findOne({
        where: { userId }
      });
      expect(config).toBeDefined();
      expect(config?.databaseName).toBe(`datanav_user_${userId}`);
    });
  });
});
