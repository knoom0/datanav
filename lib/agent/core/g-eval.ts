import { LanguageModelV2 } from "@ai-sdk/provider";
import { ModelMessage, generateObject, UserContent } from "ai";
import { z } from "zod/v3";

import { getAgentModel } from "@/lib/agent/core/agent";

type Rubric = {
  scoreRange: [number, number];
}

type LLMTestCase = {
  input: string;
  inputImage?: string;
  actualOutput?: string;
  actualOutputImage?: string;
  expectedOutput?: string;
  expectedOutputImage?: string;
  additionalContext?: string;
}

export class LLMTestCaseResult {
  score: number;
  reason: string;

  constructor(score: number, reason: string) {
    this.score = score;
    this.reason = reason;
  }

  toString(): string {
    return `Score: ${this.score.toFixed(3)}, Reason: ${this.reason}`;
  }
}

interface BaseMetric {
  readonly name: string;
  measure(testCase: LLMTestCase): Promise<LLMTestCaseResult>;
}

function testCaseToString(testCase: LLMTestCase): string {
  const parts = [];
  if (testCase.input) {
    parts.push(`Input: ${testCase.input}`);
  }
  if (testCase.actualOutput) {
    parts.push(`Actual Output: ${testCase.actualOutput}`);
  }
  if (testCase.expectedOutput) {
    parts.push(`Expected Output: ${testCase.expectedOutput}`);
  }
  if (testCase.additionalContext) {
    parts.push(`Additional Context: ${testCase.additionalContext}`);
  }
  return parts.join("\n\n");
}

function evaluationStepsPrompt(criteria: string[]): string {
  return `
Given an evaluation criteria which outlines how you should judge the {parameters}, generate 3-4 concise evaluation steps based on the criteria below. You MUST make it clear how to evaluate {parameters} in relation to one another.

Evaluation Criteria:
${criteria}

**
IMPORTANT: Please make sure to only return in JSON format, with the "steps" key as a list of strings. No words or explanation is needed.
Example JSON:
{{
    "steps": <list_of_strings>
}}
**

JSON:
`
}

function evaluatePrompt(evaluationSteps: string[], testCase: LLMTestCase, rubric: Rubric): string {

  return `
Given the evaluation steps, return a JSON with two keys: 
1) a \`score\` key ranging from ${rubric.scoreRange[0]} to ${rubric.scoreRange[1]}, with ${rubric.scoreRange[1]} being that it follows the criteria outlined in the steps and ${rubric.scoreRange[0]} being that it does not, and 
2) a \`reason\` key, a reason for the given score, but DO NOT QUOTE THE SCORE in your reason. Please mention specific information from {parameters} in your reason, but be very concise with it!

Evaluation Steps:
${evaluationSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

${testCaseToString(testCase)}

**
IMPORTANT: Please make sure to only return in JSON format, with the "score" and "reason" key. No words or explanation is needed.
Example JSON:
{{
    "score": ${rubric.scoreRange[0]},
    "reason": "The text does not follow the evaluation steps provided."
}}
**

JSON:
`;
}

export class GEval implements BaseMetric {
  name: string;
  criteria: string[];
  model: LanguageModelV2;
  threshold: number;
  evaluationSteps?: string[];
  rubric: Rubric;

  constructor({name, model, criteria, threshold}: {
    name: string, 
    criteria: string[], 
    threshold?: number
    model?: LanguageModelV2, 
  }) {
    this.name = name;
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this) as LanguageModelV2;
    }
    this.criteria = criteria;
    this.threshold = threshold ?? 0.5;
    this.rubric = {scoreRange: [0, 1]};
  }

  async generateEvaluationSteps() {
    const response = await generateObject({
      model: this.model,
      prompt: evaluationStepsPrompt(this.criteria),
      schema: z.object({
        steps: z.array(z.string())
      })
    });
  
    const parsed = response.object;
    if (!Array.isArray(parsed.steps)) {
      throw new Error(`steps is not an array: ${response}`);
    }
    this.evaluationSteps = parsed.steps;
  }

  async measure(testCase: LLMTestCase): Promise<LLMTestCaseResult> {
    if (!this.evaluationSteps) {
      await this.generateEvaluationSteps();
    }

    const parts: UserContent = [
      { type: "text", text: evaluatePrompt(this.evaluationSteps!, testCase, {scoreRange: [0, 1]}) },
    ];
    if (testCase.inputImage) {
      parts.push({ type: "text", text: "Input Image:" });
      parts.push({ type: "image", image: testCase.inputImage });
    }
    if (testCase.actualOutputImage) {
      parts.push({ type: "text", text: "Actual Output Image:" });
      parts.push({ type: "image", image: testCase.actualOutputImage });
    }
    if (testCase.expectedOutputImage) {
      parts.push({ type: "text", text: "Expected Output Image:" });
      parts.push({ type: "image", image: testCase.expectedOutputImage });
    }

    const response = await generateObject({
      model: this.model,
      messages: [
        {
          role: "user",
          content: parts
        }
      ] as ModelMessage[],
      schema: z.object({
        score: z.number(),
        reason: z.string()
      }),
    });

    const parsed = response.object;
    if (isNaN(parsed.score) || parsed.score < this.rubric.scoreRange[0] || parsed.score > this.rubric.scoreRange[1]) {
      throw new Error(`Invalid score returned from evaluation: ${response}`);
    }

    return new LLMTestCaseResult(parsed.score, parsed.reason);
  }
}
