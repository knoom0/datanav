import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { DataSource } from "typeorm";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

import { createSchemaIfNotExist } from "@/lib/util/db-util";

describe("createSchemaIfNotExist", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer("postgres:15")
      .withDatabase("test_db")
      .withUsername("test_user")
      .withPassword("test_password")
      .start();
  }, 60000);

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it("should create schema if it doesn't exist", async () => {
    const dataSourceOptions = {
      type: "postgres" as const,
      host: container.getHost(),
      port: container.getFirstMappedPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    };

    // Ensure the schema gets created
    await createSchemaIfNotExist({
      dataSourceOptions,
      schemaName: "test_schema"
    });

    // Verify the schema exists by connecting and querying
    const testDataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      synchronize: false,
    });

    await testDataSource.initialize();

    try {
      const result = await testDataSource.query(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
        ["test_schema"]
      );

      expect(result).toHaveLength(1);
      expect(result[0].schema_name).toBe("test_schema");
    } finally {
      await testDataSource.destroy();
    }
  });

  it("should not fail if schema already exists", async () => {
    const dataSourceOptions = {
      type: "postgres" as const,
      host: container.getHost(),
      port: container.getFirstMappedPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    };

    // Call twice to ensure it doesn't fail on existing schema
    await createSchemaIfNotExist({
      dataSourceOptions,
      schemaName: "existing_schema"
    });
    await expect(createSchemaIfNotExist({
      dataSourceOptions,
      schemaName: "existing_schema"
    })).resolves.not.toThrow();
  });
});
