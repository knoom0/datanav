import { describe, it, expect } from "vitest";

import { validateDataConnectorConfig, DataConnectorConfig } from "@/lib/data/connector";

describe("validateDataConnectorConfig", () => {
  const validConfig: DataConnectorConfig = {
    id: "test-connector",
    name: "Test Connector",
    description: "A test connector",
    resources: [{ name: "Resource1" }, { name: "Resource2" }]
  };

  it("should return null for a valid config", () => {
    const error = validateDataConnectorConfig(validConfig);
    expect(error).toBeNull();
  });

  it("should allow missing id (auto-generated)", () => {
    const config = { ...validConfig };
    delete (config as any).id;
    const error = validateDataConnectorConfig(config);
    expect(error).toBeNull();
  });

  it("should return error when name is missing", () => {
    const config = { ...validConfig, name: "" };
    const error = validateDataConnectorConfig(config);
    expect(error).toBe("Missing required field: name");
  });

  it("should return error when description is missing", () => {
    const config = { ...validConfig, description: "" };
    const error = validateDataConnectorConfig(config);
    expect(error).toBe("Missing required field: description");
  });

  it("should return error when resources is missing", () => {
    const config = { ...validConfig };
    delete (config as any).resources;
    const error = validateDataConnectorConfig(config);
    expect(error).toBe("Missing or invalid required field: resources (must be a non-empty array)");
  });

  it("should return error when resources is not an array", () => {
    const config = { ...validConfig, resources: "not-an-array" as any };
    const error = validateDataConnectorConfig(config);
    expect(error).toBe("Missing or invalid required field: resources (must be a non-empty array)");
  });

  it("should return error when resources is an empty array", () => {
    const config = { ...validConfig, resources: [] };
    const error = validateDataConnectorConfig(config);
    expect(error).toBe("Missing or invalid required field: resources (must be a non-empty array)");
  });

  it("should return error when resource is missing name field", () => {
    const config = { ...validConfig, resources: [{ name: "valid" }, {} as any] };
    const error = validateDataConnectorConfig(config);
    expect(error).toBe("Invalid resource at index 1: missing required field 'name'");
  });

  it("should accept config with optional fields", () => {
    const config: DataConnectorConfig = {
      ...validConfig,
      dataLoader: "google-api",
      dataLoaderOptions: { scope: ["email"] }
    };
    const error = validateDataConnectorConfig(config);
    expect(error).toBeNull();
  });
});
