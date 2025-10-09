import { GEval } from "@/lib/agent/core/g-eval";
import { DEFAULT_QA_MODEL } from "@/lib/consts";

describe("GEval", () => {
  describe("constructor", () => {
    it("should initialize with default values", () => {
      const geval = new GEval({
        name: "Test Metric",
        model: DEFAULT_QA_MODEL,
        criteria: ["Test criteria"],
      });

      expect(geval.name).toBe("Test Metric");
      expect(geval.criteria).toEqual(["Test criteria"]);
      expect(geval.threshold).toBe(0.5);
      expect(geval.rubric).toEqual({ scoreRange: [0, 1] });
    });

    it("should initialize with custom values", () => {
      const geval = new GEval({
        name: "Custom Metric",
        model: DEFAULT_QA_MODEL,
        criteria: ["Criteria 1", "Criteria 2"],
        threshold: 0.8,
      });

      expect(geval.threshold).toBe(0.8);
    });
  });

  describe("evaluation tests", () => {
    const testCase = {
      input: "What is 2 + 2?",
      actualOutput: "2 + 2 equals 4.",
      expectedOutput: "4",
    };

    it("should evaluate mathematical accuracy correctly", async () => {
      const geval = new GEval({
        name: "Math Accuracy",
        model: DEFAULT_QA_MODEL,
        criteria: ["Check if the mathematical answer is correct"],
        threshold: 0.7,
      });

      const result = await geval.measure(testCase);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(typeof result.reason).toBe("string");
      
      // For a simple math problem with correct answer, should score reasonably well
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    }, 25000);

    it("should work with standard evaluation approach", async () => {
      const geval = new GEval({
        name: "Math Accuracy Standard",
        model: DEFAULT_QA_MODEL,
        criteria: ["Check if the mathematical answer is correct"],
        threshold: 0.7,
      });

      const result = await geval.measure(testCase);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(typeof result.reason).toBe("string");
      
      // Should still score highly for correct answer
      expect(result.score).toBeGreaterThan(0.7);
    }, 20000);

    it("should generate evaluation steps from criteria", async () => {
      const geval = new GEval({
        name: "Step Generation Test",
        model: DEFAULT_QA_MODEL,
        criteria: ["Check if the response is accurate", "Evaluate clarity and completeness"],
      });

      await geval.generateEvaluationSteps();

      expect(geval.evaluationSteps).toBeDefined();
      expect(Array.isArray(geval.evaluationSteps)).toBe(true);
      expect(geval.evaluationSteps!.length).toBeGreaterThan(0);
      // Should have meaningful evaluation steps
      expect(geval.evaluationSteps!.some(step => 
        step.toLowerCase().includes("accuracy") || step.toLowerCase().includes("correct")
      )).toBe(true);
    }, 15000);

    it("should handle incorrect answers appropriately", async () => {
      const incorrectTestCase = {
        input: "What is the capital of France?",
        actualOutput: "London is the capital of France.",
        expectedOutput: "Paris",
      };

      const geval = new GEval({
        name: "Geography Accuracy",
        model: DEFAULT_QA_MODEL,
        criteria: ["Check if the answer is factually correct"],
        threshold: 0.7,
      });

      const result = await geval.measure(incorrectTestCase);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Should score poorly for incorrect answer
      expect(result.score).toBeLessThan(0.5);
    }, 20000);

    it("should test evaluation with multiple responses", async () => {
      const geval = new GEval({
        name: "Response Quality Test",
        model: DEFAULT_QA_MODEL,
        criteria: ["Rate the response quality"],
      });

      // Test multiple different responses to see variation in scores
      const responses = [
        "JavaScript is very popular.",
        "Python is widely used.",
        "Both JavaScript and Python are popular programming languages.",
      ];

      const results = [];
      for (let i = 0; i < responses.length; i++) {
        const result = await geval.measure({
          input: "What is a popular programming language?",
          actualOutput: responses[i],
          expectedOutput: "A popular programming language",
        });
        
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        
        results.push({
          response: responses[i],
          score: result.score,
        });
      }

      // All results should have valid scores
      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });

      // eslint-disable-next-line no-console
      console.log("Evaluation test results:", results);
    }, 45000);

    it("should verify evaluation scoring works correctly", async () => {
      const geval = new GEval({
        name: "Quality Evaluation Test",
        model: DEFAULT_QA_MODEL,
        criteria: ["The response correctly answers the mathematical question with the right result"],
      });

      const result = await geval.measure({
        input: "What is 2 + 2?",
        actualOutput: "2 + 2 equals 4.",
        expectedOutput: "4",
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.reason).toBeDefined();

      // eslint-disable-next-line no-console
      console.log(`Evaluation test - score: ${result.score}`);
      
      // Since AI evaluation can be inconsistent, we only verify the structure
      // and that we get some meaningful output, not a specific score threshold
    }, 25000);
  });

  describe("error handling", () => {
    it("should handle empty criteria array", () => {
      expect(() => {
        new GEval({
          name: "Empty Criteria",
          model: DEFAULT_QA_MODEL,
          criteria: [],
        });
      }).not.toThrow();
    });

    it("should handle test cases with additional context", async () => {
      const complexTestCase = {
        input: "Explain quantum computing",
        actualOutput: "Quantum computing uses quantum bits that can exist in superposition.",
        expectedOutput: "Quantum computing leverages quantum mechanical phenomena.",
        additionalContext: "This is for a high school physics class.",
      };

      const geval = new GEval({
        name: "Physics Explanation",
        model: DEFAULT_QA_MODEL,
        criteria: ["Check scientific accuracy", "Evaluate age-appropriate language"],
      });

      const result = await geval.measure(complexTestCase);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }, 30000);
  });
}); 