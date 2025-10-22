import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getConfig } from "@/lib/config";

describe("Config Functions", () => {
  it("should get config packages map", () => {
    const config = getConfig();
    
    expect(config).toHaveProperty("packages");
    expect(typeof config.packages).toBe("object");
    expect(config.packages).not.toBeNull();
    expect(Object.keys(config.packages).length).toBeGreaterThan(0);
    
    // Verify expected packages are in config
    const packageNames = Object.keys(config.packages);
    expect(packageNames).toContain("react");
    expect(packageNames).toContain("@mantine/core");
    expect(packageNames).toContain("@mantine/charts");
    expect(packageNames).toContain("@mantine/form");
    expect(packageNames).toContain("@mantine/hooks");
    expect(packageNames).toContain("@heroicons/react/24/solid");
    expect(packageNames).toContain("@heroicons/react/24/outline");
    expect(packageNames).toContain("@tabler/icons-react");
    
    // Verify each package has a module
    Object.entries(config.packages).forEach(([name, module]) => {
      expect(typeof name).toBe("string");
      expect(module).toBeDefined();
    });
  });

  describe("Browser environment protection", () => {
    beforeEach(() => {
      // Mock browser environment
      global.window = {} as any;
    });

    afterEach(() => {
      // Clean up
      delete (global as any).window;
    });

    it("should throw error when getConfig is called in browser environment", () => {
      expect(() => getConfig()).toThrow(
        "getConfig() cannot be called in browser environment"
      );
    });
  });
}); 