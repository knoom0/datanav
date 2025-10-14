import fs from "fs";
import os from "os";
import path from "path";

import { createUIMessageStream, type UIMessageStreamWriter } from "ai";

import { agentStreamToMessage } from "@/lib/agent/core/agent";
import { DesignGen } from "@/lib/agent/designing/design-gen";
import { DEFAULT_QA_MODEL } from "@/lib/consts";
import { Project, PRD, Design, ProjectConfig } from "@/lib/types";
import { describeIf, envVarsCondition } from "@/lib/util/test-util";

/**
 * Helper function to read a test image as ArrayBuffer
 */
function readTestImageFile(filename: string): ArrayBuffer {
  const imagePath = path.join(__dirname, "testdata", filename);
  const buffer = fs.readFileSync(imagePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

const requiredEnvVars = ["OPENAI_API_KEY"];

describeIf(
  "DesignGen",
  () => envVarsCondition("DesignGen", requiredEnvVars),
  () => {
    const model = DEFAULT_QA_MODEL;
    let project: Project;
    let projectConfig: ProjectConfig;

    beforeEach(() => {
      project = new Project("test-design-project");
      projectConfig = {
        screenSize: { width: 375, height: 812 },
        deviceType: "mobile",
        designRefImage: readTestImageFile("design_ref.png")
      };
    });

    describe("iterate method", () => {
      it("should throw error if project has no PRD", async () => {
      const designGen = new DesignGen({
        model,
        project,
        projectConfig
      });

      let error: any = null;

      const stream = createUIMessageStream({
        execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
          try {
            await designGen.iterate({
              writer,
              iteration: 1
            });
          } catch (err) {
            error = err;
          }
        }
      });

      await agentStreamToMessage(stream);

      expect(error).toBeTruthy();
      expect(error.message).toContain("A project must have a PRD artifact");
    });

      it("should generate design images based on PRD requirements", async () => {
      // Add a PRD to the project
      const prd: PRD = {
        type: "prd",
        text: `## Key Requirements
Create a product detail view for an e-commerce mobile app.

## Solution Idea
A single screen that displays product information and allows users to add items to cart.

## Data Requirements
- Product details (name, price, description)
- Product images
- Available options (colors, sizes)
- Customer ratings and reviews

## UI Requirements
- Product image gallery at top
- Product title and price display
- Color and size selectors
- Add to cart button
- Customer rating display`
      };
      project.put(prd);

      const designGen = new DesignGen({
        model,
        project,
        projectConfig
      });

      let result: any = null;
      let error: any = null;

      const stream = createUIMessageStream({
        execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
          try {
            result = await designGen.iterate({
              writer,
              iteration: 1
            });
          } catch (err) {
            error = err;
          }
        }
      });

      await agentStreamToMessage(stream);

      // Check for errors first
      if (error) {
        throw error;
      }

      // Save the design image to a file and log its path
      const designImage = (project.get("design") as Design).images[0].imageBase64;
      // Generate a temporary file in the test directory
      const testName = "design-generation-test";
      const designImagePath = path.join(os.tmpdir(), `design-image-${testName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.png`);
      fs.writeFileSync(designImagePath, Buffer.from(designImage, "base64"));
      // eslint-disable-next-line no-console
      console.log(`Design image saved to: ${designImagePath}`);

      // Should complete successfully
      expect(result).toBeTruthy();
      expect(result.success).toBeTruthy();
      expect(result.response).toBeTruthy();
      expect(result.response.text).toContain("design image");
      expect(result.response.text).toContain("375x812");

      // Check if Design artifact was created
      const design = project.get("design") as Design;
      expect(design).toBeTruthy();
      expect(design.type).toBe("design");
      expect(design.images).toBeTruthy();
      expect(Array.isArray(design.images)).toBeTruthy();
      expect(design.images.length).toBeGreaterThan(0);

      // Verify design images structure
      design.images.forEach(image => {
        expect(image.imageBase64).toBeTruthy();
        expect(typeof image.imageBase64).toBe("string");
        expect(image.description).toBeTruthy();
        expect(typeof image.description).toBe("string");
      });
      }, 300_000);
    });
  }
);
