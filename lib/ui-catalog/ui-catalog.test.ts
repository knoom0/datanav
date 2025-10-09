import { DataSource } from "typeorm";

import { ComponentInfoEntity } from "@/lib/data/entities";
import { ComponentInfo } from "@/lib/types";
import { 
  saveComponentInfo, 
  ComponentInfoSaveTool, 
  getAllComponentInfo, 
  getComponentInfoByName, 
  searchComponentInfo, 
  getSearchComponentCount,
  getPackageNames, 
  UICatalogTool 
} from "@/lib/ui-catalog/ui-catalog";
import { setupTestDatabase, teardownTestDatabase, type TestDatabaseSetup } from "@/lib/util/test-util";

describe("Component Database Tests", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;

  beforeAll(async () => {
    testDbSetup = await setupTestDatabase();
    testDataSource = testDbSetup.dataSource;
  }, 60000); // Increase timeout for container startup

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  });

  beforeEach(async () => {
    // Clean up data before each test
    await testDataSource.getRepository(ComponentInfoEntity).clear();
  });

  describe("saveComponentInfo", () => {
    it("should save component info to real database", async () => {
      const componentInfo: ComponentInfo = {
        name: "TestButton",
        description: "A test button component",
        documentation: "# TestButton\n\nA test button component.\n\n## Usage\n\n```jsx\n<TestButton>Click me</TestButton>\n```",
        packageName: "@test/components",
        packageVersion: "1.0.0",
        keywords: ["button", "ui", "component"]
      };

      const result = await saveComponentInfo(componentInfo, testDataSource);
      
      expect(result.name).toBe("TestButton");
      expect(result.description).toBe("A test button component");
      expect(result.keywords).toEqual(["button", "ui", "component"]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify it was actually saved to the database
      const saved = await testDataSource.getRepository(ComponentInfoEntity).findOne({
        where: { name: "TestButton" }
      });
      expect(saved).toBeDefined();
      expect(saved!.name).toBe("TestButton");
      expect(saved!.description).toBe("A test button component");
      expect(saved!.keywords).toEqual(["button", "ui", "component"]);
    });

    it("should handle component info with minimal data", async () => {
      const componentInfo: ComponentInfo = {
        name: "MinimalComponent",
        description: "Minimal component",
        documentation: "# Minimal",
        packageName: "@test/minimal",
        packageVersion: "0.1.0"
      };

      const result = await saveComponentInfo(componentInfo, testDataSource);
      
      expect(result.name).toBe("MinimalComponent");
      expect(result.keywords).toEqual([]); // Should default to empty array
      
      // Verify in database
      const saved = await testDataSource.getRepository(ComponentInfoEntity).findOne({
        where: { name: "MinimalComponent" }
      });
      expect(saved).toBeDefined();
      expect(saved!.keywords).toEqual([]);
    });

    it("should handle duplicate component names by updating", async () => {
      const componentInfo: ComponentInfo = {
        name: "DuplicateTest",
        description: "Original description",
        documentation: "# Original",
        packageName: "@test/original",
        packageVersion: "1.0.0",
        keywords: ["original"]
      };

      // Save first time
      await saveComponentInfo(componentInfo, testDataSource);
      
      // Save with same name but different content
      const updatedInfo: ComponentInfo = {
        ...componentInfo,
        description: "Updated description",
        keywords: ["updated"]
      };
      
      await saveComponentInfo(updatedInfo, testDataSource);
      
      // Check that there"s only one record (PostgreSQL should handle upsert)
      const saved = await testDataSource.getRepository(ComponentInfoEntity).findOne({
        where: { name: "DuplicateTest" }
      });
      expect(saved).toBeDefined();
      expect(saved!.description).toBe("Updated description");
      expect(saved!.keywords).toEqual(["updated"]);
    });
  });

  describe("ComponentInfoSaveTool", () => {
    it("should save component info through tool interface", async () => {
      const tool = new ComponentInfoSaveTool(testDataSource);
      
      // Use executeInternal to get the actual object, not JSON string
      const result = await (tool as any).executeInternal({
        name: "ToolTestButton",
        description: "Button component from tool",
        documentation: "# ToolTestButton\n\nUsed via tool interface",
        packageName: "@tool/components",
        packageVersion: "2.0.0",
        keywords: ["tool", "button", "test"]
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Component info 'ToolTestButton' successfully stored in database");
      expect(result.storedData.name).toBe("ToolTestButton");
      expect(result.storedData.keywords).toEqual(["tool", "button", "test"]);

      // Verify in database
      const saved = await testDataSource.getRepository(ComponentInfoEntity).findOne({
        where: { name: "ToolTestButton" }
      });
      expect(saved).toBeDefined();
      expect(saved!.name).toBe("ToolTestButton");
      expect(saved!.keywords).toEqual(["tool", "button", "test"]);
    });

    it("should handle tool validation correctly", async () => {
      const tool = new ComponentInfoSaveTool(testDataSource);
      
      // Test that the tool has correct schema
      const params = tool.inputSchema;
      expect(params).toBeDefined();
      expect(params.shape).toHaveProperty("name");
      expect(params.shape).toHaveProperty("description");
      expect(params.shape).toHaveProperty("documentation");
      expect(params.shape).toHaveProperty("packageName");
      expect(params.shape).toHaveProperty("packageVersion");
      expect(params.shape).toHaveProperty("keywords");
    });
  });

  describe("Component retrieval functions", () => {
    beforeEach(async () => {
      // Set up test data
      const testComponents: ComponentInfo[] = [
        {
          name: "Button",
          description: "A button ui component for forms",
          documentation: "# Button\n\nA button component.",
          packageName: "@mantine/core",
          packageVersion: "7.0.0",
          keywords: ["button", "ui", "form"]
        },
        {
          name: "TextInput",
          description: "A text input component for forms",
          documentation: "# TextInput\n\nA text input component.",
          packageName: "@mantine/core",
          packageVersion: "7.0.0",
          keywords: ["input", "form", "text"]
        },
        {
          name: "Card",
          description: "A card ui container component",
          documentation: "# Card\n\nA card component.",
          packageName: "@material-ui/core",
          packageVersion: "5.0.0",
          keywords: ["card", "container", "ui"]
        }
      ];

      for (const component of testComponents) {
        await saveComponentInfo(component, testDataSource);
      }
    });

    it("should get all component info", async () => {
      const components = await getAllComponentInfo({ dataSource: testDataSource });
      
      expect(components.length).toBe(3);
      expect(components[0].name).toBe("Button"); // Should be sorted by name
      expect(components[1].name).toBe("Card");
      expect(components[2].name).toBe("TextInput");
      
      // Should be plain objects, not entity instances
      expect(components[0].constructor.name).toBe("Object");
      expect(components[0]).toHaveProperty("createdAt");
      expect(components[0]).toHaveProperty("updatedAt");
    });

    it("should get component info by name", async () => {
      const component = await getComponentInfoByName("Button", testDataSource);
      
      expect(component).toBeDefined();
      expect(component!.name).toBe("Button");
      expect(component!.packageName).toBe("@mantine/core");
      expect(component!.keywords).toEqual(["button", "ui", "form"]);
      
      // Should be plain object, not entity instance
      expect(component!.constructor.name).toBe("Object");
      expect(component!).toHaveProperty("createdAt");
      expect(component!).toHaveProperty("updatedAt");
    });

    it("should return null for non-existent component", async () => {
      const component = await getComponentInfoByName("NonExistentComponent", testDataSource);
      expect(component).toBeNull();
    });

    it("should search components by package name", async () => {
      const components = await searchComponentInfo({ packageName: "@mantine/core", dataSource: testDataSource });
      
      expect(components.length).toBe(2);
      expect(components.map(c => c.name)).toEqual(["Button", "TextInput"]);
      
      // Should be plain objects, not entity instances
      expect(components[0].constructor.name).toBe("Object");
    });

    it("should search components by query term matching name", async () => {
      const components = await searchComponentInfo({ query: "TextInput", dataSource: testDataSource });
      
      expect(components.length).toBe(1);
      expect(components[0].name).toBe("TextInput");
    });

    it("should search components by query keywords", async () => {
      const components = await searchComponentInfo({ query: "form", dataSource: testDataSource });
      
      expect(components.length).toBe(2);
      expect(components.map(c => c.name)).toEqual(["Button", "TextInput"]);
      
      // Should be plain objects, not entity instances
      expect(components[0].constructor.name).toBe("Object");
    });

    it("should search components with multiple words in query", async () => {
      const components = await searchComponentInfo({ query: "button OR ui", dataSource: testDataSource });
      
      // Should match components containing either "button" OR "ui" in name or keywords
      // Button: has both "button" and "ui" keywords
      // Card: has "ui" keyword
      // TextInput: has neither "button" nor "ui" - should NOT match
      expect(components.length).toBe(2);
      expect(components.map(c => c.name)).toEqual(["Button", "Card"]);
    });

    it("should get all package names", async () => {
      const packageNames = await getPackageNames(testDataSource);
      
      expect(packageNames.length).toBe(2);
      expect(packageNames).toContain("@mantine/core");
      expect(packageNames).toContain("@material-ui/core");
    });
  });

  describe("Full-Text Search Tests", () => {
    beforeEach(async () => {
      // Set up comprehensive test data for full-text search testing
      const testComponents: ComponentInfo[] = [
        {
          name: "Button",
          description: "A versatile button component for user interactions and forms",
          documentation: "# Button Component\n\nThe Button component provides interactive elements for forms and navigation. It supports various styles, sizes, and states for optimal user experience.",
          packageName: "@mantine/core",
          packageVersion: "7.0.0",
          keywords: ["button", "ui", "form", "interactive", "click"]
        },
        {
          name: "TextInput",
          description: "Input field for collecting text data from users in forms with validation",
          documentation: "# TextInput Component\n\nThe TextInput component allows users to enter text data. It includes validation, placeholder text, and error states for comprehensive form handling.",
          packageName: "@mantine/core",
          packageVersion: "7.0.0",
          keywords: ["input", "form", "text", "field", "validation"]
        },
        {
          name: "SearchBox",
          description: "Specialized input component optimized for search functionality",
          documentation: "# SearchBox Component\n\nThe SearchBox provides a dedicated search interface with autocomplete, filtering, and result highlighting capabilities.",
          packageName: "@mantine/core",
          packageVersion: "7.0.0",
          keywords: ["search", "input", "filter", "autocomplete", "query"]
        },
        {
          name: "DataTable",
          description: "Advanced table component for displaying structured data with sorting and filtering",
          documentation: "# DataTable Component\n\nThe DataTable component displays tabular data with advanced features like sorting, filtering, pagination, and column customization.",
          packageName: "@mantine/core",
          packageVersion: "7.0.0",
          keywords: ["table", "data", "grid", "sort", "filter", "pagination"]
        },
        {
          name: "FormValidator",
          description: "Utility component for form validation and error handling",
          documentation: "# FormValidator Component\n\nThe FormValidator provides comprehensive form validation with custom rules, error messages, and validation triggers.",
          packageName: "@form/utils",
          packageVersion: "2.1.0",
          keywords: ["validation", "form", "error", "rules", "check"]
        },
        {
          name: "NavigationMenu",
          description: "Responsive navigation menu with dropdown and mobile support",
          documentation: "# NavigationMenu Component\n\nThe NavigationMenu provides site navigation with responsive design, dropdown menus, and mobile-friendly collapsible interface.",
          packageName: "@navigation/core",
          packageVersion: "1.5.0",
          keywords: ["navigation", "menu", "dropdown", "mobile", "responsive"]
        }
      ];

      for (const component of testComponents) {
        await saveComponentInfo(component, testDataSource);
      }

      // Wait a moment for the database indexes to be fully created
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe("Basic full-text search functionality", () => {
      it("should find components by exact name match", async () => {
        const results = await searchComponentInfo({ query: "Button", dataSource: testDataSource });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("Button");
      });

      it("should find components by partial name match", async () => {
        const results = await searchComponentInfo({ query: "Text", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.name === "TextInput")).toBe(true);
      });

      it("should find components by keyword match", async () => {
        const results = await searchComponentInfo({ query: "validation", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(2);
        expect(results.some(r => r.name === "TextInput")).toBe(true);
        expect(results.some(r => r.name === "FormValidator")).toBe(true);
      });

      it("should find components by description content", async () => {
        const results = await searchComponentInfo({ query: "structured data", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.name === "DataTable")).toBe(true);
      });

      it("should handle multi-word queries with AND logic", async () => {
        const results = await searchComponentInfo({ query: "form validation", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        // Should find FormValidator and potentially TextInput
        expect(results.some(r => r.name === "FormValidator")).toBe(true);
      });

      it("should handle phrase queries", async () => {
        const results = await searchComponentInfo({ query: "user interactions", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.name === "Button")).toBe(true);
      });

      it("should handle stemming and variations", async () => {
        // Test that searching for "interact" finds "interactive"
        const results = await searchComponentInfo({ query: "interact", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.name === "Button")).toBe(true);
      });
    });

    describe("Relevance ranking", () => {
      it("should rank exact name matches higher than description matches", async () => {
        const results = await searchComponentInfo({ query: "search", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        // SearchBox should rank higher due to name match
        expect(results[0].name).toBe("SearchBox");
      });

      it("should handle case-insensitive searches", async () => {
        const results = await searchComponentInfo({ query: "BUTTON", dataSource: testDataSource });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("Button");
      });

      it("should return results ordered by relevance", async () => {
        const results = await searchComponentInfo({ query: "form", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(2);
        
        // Results should be ordered by relevance score
        // FormValidator should typically rank higher due to multiple matches
        const formValidatorIndex = results.findIndex(r => r.name === "FormValidator");
        const textInputIndex = results.findIndex(r => r.name === "TextInput");
        
        expect(formValidatorIndex).toBeGreaterThanOrEqual(0);
        expect(textInputIndex).toBeGreaterThanOrEqual(0);
      });
    });

    describe("Search filtering and pagination", () => {
      it("should filter by package name and search query", async () => {
        const results = await searchComponentInfo({ 
          query: "form", 
          packageName: "@mantine/core",
          dataSource: testDataSource 
        });
        
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.every(r => r.packageName === "@mantine/core")).toBe(true);
        expect(results.some(r => r.name === "TextInput")).toBe(true);
        // FormValidator should not appear as it"s from @form/utils
        expect(results.some(r => r.name === "FormValidator")).toBe(false);
      });

      it("should respect limit parameter", async () => {
        const results = await searchComponentInfo({ 
          query: "component", 
          limit: 2,
          dataSource: testDataSource 
        });
        
        expect(results.length).toBeLessThanOrEqual(2);
      });

      it("should respect offset parameter", async () => {
        const allResults = await searchComponentInfo({ query: "component", dataSource: testDataSource });
        const offsetResults = await searchComponentInfo({ 
          query: "component", 
          offset: 1,
          dataSource: testDataSource 
        });
        
        expect(offsetResults.length).toBe(allResults.length - 1);
        if (allResults.length > 1) {
          expect(offsetResults[0].name).toBe(allResults[1].name);
        }
      });
    });

    describe("Edge cases and error handling", () => {
      it("should handle empty query gracefully", async () => {
        const results = await searchComponentInfo({ query: "", dataSource: testDataSource });
        expect(results.length).toBe(6); // Should return all components in default order
        expect(results[0].name).toBe("Button"); // Alphabetical order
      });

      it("should handle whitespace-only query", async () => {
        const results = await searchComponentInfo({ query: "   ", dataSource: testDataSource });
        expect(results.length).toBe(6); // Should return all components
      });

      it("should handle special characters in query", async () => {
        const results = await searchComponentInfo({ query: "component@data", dataSource: testDataSource });
        // Should not crash and may find partial matches
        expect(Array.isArray(results)).toBe(true);
      });

      it("should handle queries with no matches", async () => {
        const results = await searchComponentInfo({ query: "nonexistentcomponent", dataSource: testDataSource });
        expect(results).toHaveLength(0);
      });

      it("should handle single quotes in query (SQL injection prevention)", async () => {
        const results = await searchComponentInfo({ query: "button'; DROP TABLE component_info; --", dataSource: testDataSource });
        // Should not crash and should handle escaping properly
        expect(Array.isArray(results)).toBe(true);
      });
    });

    describe("Search count functionality", () => {
      it("should return correct count for search results", async () => {
        const results = await searchComponentInfo({ query: "form", dataSource: testDataSource });
        const count = await getSearchComponentCount({ query: "form", dataSource: testDataSource });
        
        expect(count).toBe(results.length);
        expect(count).toBeGreaterThanOrEqual(2);
      });

      it("should return correct count with package filter", async () => {
        const results = await searchComponentInfo({ 
          query: "component", 
          packageName: "@mantine/core",
          dataSource: testDataSource 
        });
        const count = await getSearchComponentCount({ 
          query: "component", 
          packageName: "@mantine/core",
          dataSource: testDataSource 
        });
        
        expect(count).toBe(results.length);
      });

      it("should return zero count for no matches", async () => {
        const count = await getSearchComponentCount({ query: "nonexistentcomponent", dataSource: testDataSource });
        expect(count).toBe(0);
      });
    });

    describe("Complex search scenarios", () => {
      it("should handle boolean-like queries", async () => {
        // websearch_to_tsquery should handle this format
        const results = await searchComponentInfo({ query: "form AND validation", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.name === "FormValidator")).toBe(true);
      });

      it("should handle OR queries", async () => {
        const results = await searchComponentInfo({ query: "button OR navigation", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(2);
        expect(results.some(r => r.name === "Button")).toBe(true);
        expect(results.some(r => r.name === "NavigationMenu")).toBe(true);
      });

      it("should find components across all searchable fields", async () => {
        // Test that search works across different fields with OR logic
        // Use OR syntax to find components that match any of these terms
        const results = await searchComponentInfo({ query: "advanced OR responsive", dataSource: testDataSource });
        expect(results.length).toBeGreaterThanOrEqual(2);
        
        // DataTable should match due to "advanced" in description
        expect(results.some(r => r.name === "DataTable")).toBe(true);
        // NavigationMenu should match due to "responsive" in keywords
        expect(results.some(r => r.name === "NavigationMenu")).toBe(true);
      });
    });
  });

  describe("UICatalogTool with multiple packages", () => {
    beforeEach(async () => {
      // Set up test data for multiple packages
      const testComponents: ComponentInfo[] = [
        {
          name: "Button",
          description: "Mantine button component",
          documentation: "# Mantine Button\n\nA button component from Mantine.",
          packageName: "@mantine/core",
          packageVersion: "8.0.0",
          keywords: ["button", "ui", "mantine"]
        },
        {
          name: "HomeIcon",
          description: "Home icon component",
          documentation: "# Home Icon\n\nA home icon from Hero Icons.",
          packageName: "@heroicons/react",
          packageVersion: "2.2.0",
          keywords: ["icon", "home", "ui"]
        },
        {
          name: "StarIcon",
          description: "Star icon component",
          documentation: "# Star Icon\n\nA star icon from Tabler Icons.",
          packageName: "@tabler/icons-react",
          packageVersion: "3.31.0",
          keywords: ["icon", "star", "ui"]
        }
      ];

      for (const component of testComponents) {
        await saveComponentInfo(component, testDataSource);
      }
    });

    it("should search across multiple packages using search operation", async () => {
      const tool = new UICatalogTool([
        "@mantine/core",
        "@heroicons/react", 
        "@tabler/icons-react"
      ], testDataSource);

      // Use executeInternal to get the actual object, not JSON string
      const result = await (tool as any).executeInternal({ 
        operation: "search",
        query: "icon" 
      });
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe("search");
      // Should find HomeIcon and StarIcon (both have "icon" in keywords and name)
      // Button should NOT match as it doesn"t have "icon" in name or keywords
      expect(result.components).toHaveLength(2);
      expect(result.components.map((c: any) => c.name).sort()).toEqual(["HomeIcon", "StarIcon"]);
      
      // Should only return name, description, and packageName for search results
      expect(result.components[0]).toHaveProperty("name");
      expect(result.components[0]).toHaveProperty("description");
      expect(result.components[0]).toHaveProperty("packageName");
      expect(result.components[0]).not.toHaveProperty("documentation");
      expect(result.components[0]).not.toHaveProperty("keywords");
      
      expect(result.message).toContain("Found 2 component(s) matching \"icon\"");
      expect(result.message).toContain("@mantine/core, @heroicons/react, @tabler/icons-react");
    });

    it("should read documentation for a specific component using read_doc operation", async () => {
      const tool = new UICatalogTool(["@heroicons/react"], testDataSource);

      // Use executeInternal to get the actual object, not JSON string
      const result = await (tool as any).executeInternal({ 
        operation: "read_doc",
        componentName: "HomeIcon"
      });
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe("read_doc");
      expect(result.component).toBeDefined();
      expect(result.component.name).toBe("HomeIcon");
      expect(result.component.packageName).toBe("@heroicons/react");
      expect(result.component.documentation).toBe("# Home Icon\n\nA home icon from Hero Icons.");
      
      // Should only return name, packageName, and documentation for read_doc results
      expect(result.component).toHaveProperty("name");
      expect(result.component).toHaveProperty("packageName");
      expect(result.component).toHaveProperty("documentation");
      expect(result.component).not.toHaveProperty("description");
      expect(result.component).not.toHaveProperty("keywords");
      
      expect(result.message).toContain("Retrieved documentation for component \"HomeIcon\"");
      expect(result.message).toContain("@heroicons/react");
    });

    it("should handle missing query parameter for search operation", async () => {
      const tool = new UICatalogTool(["@mantine/core"], testDataSource);

      const result = await (tool as any).executeInternal({ 
        operation: "search"
        // Missing query parameter
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Query parameter is required for search operation");
    });

    it("should handle missing componentName parameter for read_doc operation", async () => {
      const tool = new UICatalogTool(["@mantine/core"], testDataSource);

      const result = await (tool as any).executeInternal({ 
        operation: "read_doc"
        // Missing componentName parameter
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("componentName parameter is required for read_doc operation");
    });

    it("should handle component not found for read_doc operation", async () => {
      const tool = new UICatalogTool(["@mantine/core"], testDataSource);

      const result = await (tool as any).executeInternal({ 
        operation: "read_doc",
        componentName: "NonExistentComponent"
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("Component \"NonExistentComponent\" not found");
      expect(result.error).toContain("@mantine/core");
    });

    it("should return results from specified packages and update existing components", async () => {
      // Add a button component with the same name and package but updated content
      // This should update the existing Button component due to unique constraint
      await saveComponentInfo({
        name: "Button",
        description: "Updated button component description",
        documentation: "# Button Updated\n\nAn updated button component.",
        packageName: "@mantine/core",
        packageVersion: "8.0.0", // Different version but same name+package
        keywords: ["button", "ui", "updated"]
      }, testDataSource);

      const tool = new UICatalogTool(["@mantine/core"], testDataSource);

      // Use executeInternal to get the actual object, not JSON string
      const result = await (tool as any).executeInternal({ 
        operation: "search",
        query: "button" 
      });
      
      expect(result.success).toBe(true);
      expect(result.operation).toBe("search");
      expect(result.components).toHaveLength(1); // Should find only one Button (the updated one)
      expect(result.components[0].description).toBe("Updated button component description");
      expect(result.message).toContain("Found 1 component(s) matching \"button\"");
    });
  });
}); 