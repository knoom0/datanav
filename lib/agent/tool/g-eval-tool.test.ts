import { describe, it, expect, beforeEach, vi } from "vitest";

import { GEval } from "@/lib/agent/core/g-eval";
import { DEFAULT_QA_MODEL } from "@/lib/consts";
import { Project } from "@/lib/types";

import { GEvalTool } from "./g-eval-tool";

describe("GEvalTool", () => {
  let project: Project;
  let geval: GEval;
  let gevalTool: GEvalTool;

  beforeEach(() => {
    project = new Project();
    
    geval = new GEval({
      name: "Test Evaluator",
      model: DEFAULT_QA_MODEL,
      criteria: ["The output should be accurate", "The output should be well-structured"],
      threshold: 0.7
    });

    gevalTool = new GEvalTool({
      project,
      geval
    });
  });

  describe("constructor", () => {
    it("should create a GEvalTool instance", () => {
      expect(gevalTool).toBeInstanceOf(GEvalTool);
      expect(gevalTool.name).toBe("g_eval_tool");
      expect(gevalTool.getProject()).toBe(project);
      expect(gevalTool.getGEval()).toBe(geval);
    });

    it("should have correct description", () => {
      expect(gevalTool.description).toContain("G-Eval");
      expect(gevalTool.description).toContain("score");
    });
  });

  describe("input schema", () => {
    it("should validate correct parameters", () => {
      const validParams = {
        artifactType: "prd" as const,
        input: "Create a dashboard for sales data"
      };

      const result = gevalTool.inputSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should reject invalid artifact type", () => {
      const invalidParams = {
        artifactType: "invalid_type",
        input: "Test input"
      };

      const result = gevalTool.inputSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it("should accept optional fields", () => {
      const minimalParams = {
        artifactType: "report" as const,
        input: "Generate a report"
      };

      const result = gevalTool.inputSchema.safeParse(minimalParams);
      expect(result.success).toBe(true);
    });
  });

  describe("execute", () => {
    it("should return error when artifact does not exist", async () => {
      // No artifact in project yet
      const result = await gevalTool.execute({
        artifactType: "prd",
        input: "Test input"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("No prd artifact found in project");
    });

    it("should extract text from PRD artifact", async () => {
      // Store a PRD artifact
      project.put({
        type: "prd",
        text: "This is a test PRD with requirements and solution ideas."
      });

      // Mock GEval measure
      const mockMeasure = vi.spyOn(geval, "measure").mockResolvedValue({
        score: 0.85,
        reason: "The PRD is well-structured and comprehensive",
        toString: () => "Score: 0.850, Reason: The PRD is well-structured and comprehensive"
      });

      const result = await gevalTool.execute({
        artifactType: "prd",
        input: "Create a dashboard PRD"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.artifactType).toBe("prd");
      expect(parsed.score).toBe(0.85);
      expect(parsed.reason).toContain("well-structured");
      expect(parsed.passesThreshold).toBe(true);
      expect(parsed.threshold).toBe(0.7);
      
      expect(mockMeasure).toHaveBeenCalledWith(
        expect.objectContaining({
          input: "Create a dashboard PRD",
          actualOutput: expect.stringContaining("test PRD")
        })
      );
    });

    it("should handle strategy artifact", async () => {
      // Store a strategy artifact
      project.put({
        type: "strategy",
        text: "Strategy: Focus on data-driven approach with iterative refinement."
      });

      vi.spyOn(geval, "measure").mockResolvedValue({
        score: 0.90,
        reason: "Strategy is clear and actionable",
        toString: () => "Score: 0.900, Reason: Strategy is clear and actionable"
      });

      const result = await gevalTool.execute({
        artifactType: "strategy",
        input: "Develop a strategy for dashboards"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.score).toBe(0.90);
      expect(geval.measure).toHaveBeenCalled();
    });

    it("should handle code artifact", async () => {
      // Store a code artifact
      project.put({
        type: "code",
        sourceCode: "function test() { return 42; }"
      });

      vi.spyOn(geval, "measure").mockResolvedValue({
        score: 0.75,
        reason: "Code is functional but could be better documented",
        toString: () => "Score: 0.750, Reason: Code is functional"
      });

      const result = await gevalTool.execute({
        artifactType: "code",
        input: "Write a test function"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.artifactType).toBe("code");
      expect(parsed.passesThreshold).toBe(true); // 0.75 >= 0.7
    });

    it("should indicate when score is below threshold", async () => {
      project.put({
        type: "report",
        text: "Very short report."
      });

      vi.spyOn(geval, "measure").mockResolvedValue({
        score: 0.50,
        reason: "Report is too brief and lacks detail",
        toString: () => "Score: 0.500, Reason: Report is too brief"
      });

      const result = await gevalTool.execute({
        artifactType: "report",
        input: "Generate comprehensive report"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.score).toBe(0.50);
      expect(parsed.passesThreshold).toBe(false); // 0.50 < 0.7
    });

    it("should handle design artifacts", async () => {
      project.put({
        type: "design",
        images: [
          { imageBase64: "base64data1", description: "Dashboard layout" },
          { imageBase64: "base64data2", description: "Mobile view" }
        ]
      });

      vi.spyOn(geval, "measure").mockResolvedValue({
        score: 0.88,
        reason: "Design is comprehensive",
        toString: () => "Score: 0.880"
      });

      const result = await gevalTool.execute({
        artifactType: "design",
        input: "Design a dashboard"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(geval.measure).toHaveBeenCalledWith(
        expect.objectContaining({
          actualOutput: expect.stringContaining("Dashboard layout")
        })
      );
    });

    it("should handle data_spec artifacts", async () => {
      project.put({
        type: "data_spec",
        queries: [
          {
            name: "sales_data",
            description: "Get sales data",
            query: "SELECT * FROM sales",
            columnInfos: []
          }
        ]
      });

      vi.spyOn(geval, "measure").mockResolvedValue({
        score: 0.80,
        reason: "Data spec is clear",
        toString: () => "Score: 0.800"
      });

      const result = await gevalTool.execute({
        artifactType: "data_spec",
        input: "Create data spec"
      });

      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(geval.measure).toHaveBeenCalledWith(
        expect.objectContaining({
          actualOutput: expect.stringContaining("sales_data")
        })
      );
    });
  });

  describe("getters", () => {
    it("should return the GEval instance", () => {
      expect(gevalTool.getGEval()).toBe(geval);
    });

    it("should return the Project instance", () => {
      expect(gevalTool.getProject()).toBe(project);
    });
  });
});

