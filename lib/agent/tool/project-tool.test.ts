import { ProjectTool } from "@/lib/agent/tool/project-tool";
import { Project, PRD } from "@/lib/types";

describe("ProjectTool", () => {
  let project: Project;
  let projectTool: ProjectTool;

  beforeEach(() => {
    project = new Project("Test project for ProjectTool");
    projectTool = new ProjectTool(project);
  });

  describe("tool properties", () => {
    it("should have correct name and description", () => {
      expect(projectTool.name).toBe("project_tool");
      expect(projectTool.description).toContain("Manage project artifacts");
      expect(projectTool.inputSchema).toBeDefined();
    });

    it("should expose the project instance", () => {
      expect(projectTool.getProject()).toBe(project);
    });
  });

  describe("PRD artifacts", () => {
    const prdData = {
      type: "prd",
      text: "This is a product requirements document"
    };

    it("should successfully put and get PRD artifact", async () => {
      const putResult = await projectTool.execute({
        operation: "put",
        artifactType: "prd",
        artifact: prdData
      });

      const putResponse = JSON.parse(putResult);
      expect(putResponse.success).toBe(true);
      expect(putResponse.message).toContain("Successfully stored prd artifact");

      const getResult = await projectTool.execute({
        operation: "get",
        artifactType: "prd"
      });

      const getResponse = JSON.parse(getResult);
      expect(getResponse.found).toBe(true);
      expect(getResponse.artifact).toEqual(prdData);
    });

    it("should throw error when PRD artifact lacks text field", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "prd",
        artifact: { type: "prd" }
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("PRD artifact requires text field");
    });
  });

  describe("Design artifacts", () => {
    const designData = {
      type: "design",
      images: [
        {
          imageBase64: "base64encodedimage1",
          description: "Design mockup 1"
        },
        {
          imageBase64: "base64encodedimage2",
          description: "Design mockup 2"
        }
      ]
    };

    it("should successfully put and get Design artifact", async () => {
      const putResult = await projectTool.execute({
        operation: "put",
        artifactType: "design",
        artifact: designData
      });

      const putResponse = JSON.parse(putResult);
      expect(putResponse.success).toBe(true);

      const getResult = await projectTool.execute({
        operation: "get",
        artifactType: "design"
      });

      const getResponse = JSON.parse(getResult);
      expect(getResponse.found).toBe(true);
      expect(getResponse.artifact).toEqual(designData);
    });

    it("should throw error when Design artifact lacks images array", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "design",
        artifact: { type: "design", images: "not an array" }
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("Design artifact requires images array");
    });
  });

  describe("DataSpec artifacts", () => {
    const dataSpecData = {
      type: "data_spec",
      dataSpec: {
        type: "data_spec" as const,
        queries: [
          {
            name: "users",
            description: "Get all users",
            query: "SELECT * FROM users",
            columnInfos: [
              {
                name: "id",
                dataType: "number" as const,
                description: "User ID"
              },
              {
                name: "name",
                dataType: "string" as const,
                description: "User name"
              }
            ],
            sampleData: [
              { id: 1, name: "John Doe" },
              { id: 2, name: "Jane Smith" }
            ]
          }
        ]
      }
    };

    it("should successfully put and get DataSpec artifact", async () => {
      const putResult = await projectTool.execute({
        operation: "put",
        artifactType: "data_spec",
        artifact: dataSpecData
      });

      const putResponse = JSON.parse(putResult);
      expect(putResponse.success).toBe(true);

      const getResult = await projectTool.execute({
        operation: "get",
        artifactType: "data_spec"
      });

      const getResponse = JSON.parse(getResult);
      expect(getResponse.found).toBe(true);
      // The actual artifact will have queries at top level, not nested in dataSpec
      expect(getResponse.artifact).toEqual({
        type: "data_spec",
        queries: dataSpecData.dataSpec.queries
      });
    });

    it("should throw error when DataSpec artifact lacks dataSpec with queries array", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "data_spec",
        artifact: { type: "data_spec" }
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("DataSpec artifact requires dataSpec with queries array");
    });
  });

  describe("Code artifacts", () => {
    const codeData = {
      type: "code",
      text: "function hello() { return \"Hello, World!\"; }"
    };

    it("should successfully put and get Code artifact", async () => {
      const putResult = await projectTool.execute({
        operation: "put",
        artifactType: "code",
        artifact: codeData
      });

      const putResponse = JSON.parse(putResult);
      expect(putResponse.success).toBe(true);

      const getResult = await projectTool.execute({
        operation: "get",
        artifactType: "code"
      });

      const getResponse = JSON.parse(getResult);
      expect(getResponse.found).toBe(true);
      // The actual artifact will have sourceCode field, not text
      expect(getResponse.artifact).toEqual({
        type: "code",
        sourceCode: codeData.text
      });
    });

    it("should throw error when Code artifact lacks text field", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "code",
        artifact: { type: "code" }
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("Code artifact requires text field");
    });
  });

  describe("Report artifacts", () => {
    const reportData = {
      type: "report",
      text: "# Executive Summary\n\nThis is a comprehensive report with analysis and insights.\n\n## Key Findings\n\n- Finding 1\n- Finding 2\n\n## Recommendations\n\n- Recommendation 1\n- Recommendation 2"
    };

    it("should successfully put and get Report artifact", async () => {
      const putResult = await projectTool.execute({
        operation: "put",
        artifactType: "report",
        artifact: reportData
      });

      const putResponse = JSON.parse(putResult);
      expect(putResponse.success).toBe(true);

      const getResult = await projectTool.execute({
        operation: "get",
        artifactType: "report"
      });

      const getResponse = JSON.parse(getResult);
      expect(getResponse.found).toBe(true);
      expect(getResponse.artifact).toEqual({
        type: "report",
        text: reportData.text
      });
    });

    it("should throw error when Report artifact lacks content field", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "report",
        artifact: { type: "report" }
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("Report artifact requires text field");
    });
  });

  describe("error handling", () => {
    it("should handle unknown operations", async () => {
      const result = await projectTool.execute({
        operation: "delete" as any,
        artifactType: "prd"
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("Unknown operation: delete");
    });

    it("should handle unknown artifact types", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "unknown" as any,
        artifact: { type: "unknown", data: "test" }
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("Unknown artifact type: unknown");
    });

    it("should handle missing artifact data for put operations", async () => {
      const result = await projectTool.execute({
        operation: "put",
        artifactType: "prd"
      });

      const response = JSON.parse(result);
      expect(response.error).toContain("Artifact data is required for put operation");
    });

    it("should return null for non-existent artifacts", async () => {
      const result = await projectTool.execute({
        operation: "get",
        artifactType: "prd"
      });

      const response = JSON.parse(result);
      expect(response.found).toBe(false);
      expect(response.artifact).toBeNull();
    });
  });

  describe("integration with Project class", () => {
    it("should properly integrate with Project artifact management", () => {
      const prd: PRD = { type: "prd", text: "Test PRD" };
      project.put(prd);

      // Verify the artifact was stored in the project
      const retrievedPrd = project.get("prd");
      expect(retrievedPrd).toEqual(prd);

      // Verify the tool can also retrieve it
      projectTool.execute({
        operation: "get",
        artifactType: "prd"
      }).then(result => {
        const response = JSON.parse(result);
        expect(response.found).toBe(true);
        expect(response.artifact).toEqual(prd);
      });
    });

    it("should update project updatedAt timestamp when putting artifacts", async () => {
      const initialUpdatedAt = project.updatedAt;
      
      // Add a small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await projectTool.execute({
        operation: "put",
        artifactType: "prd",
        artifact: { type: "prd", text: "Test PRD" }
      });

      expect(project.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    });
  });
});
