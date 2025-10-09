import fs from "fs";
import path from "path";

import { resizeImage, toModelInputImage } from "@/lib/ui-kit/ui-utils";

describe("resizeImage", () => {
  const testImagePath = path.join(process.cwd(), "lib", "agent", "coding", "testdata", "greeting.png");
  let testImageBuffer: Buffer;

  beforeAll(() => {
    // Load test image for all tests
    testImageBuffer = fs.readFileSync(testImagePath);
  });

  it("should resize image from file path successfully", async () => {
    const result = await resizeImage(testImagePath, 0.5);
    
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(testImageBuffer.length); // Should be smaller
  });

  it("should handle invalid inputs and edge cases", async () => {
    // Invalid rate
    await expect(resizeImage(testImagePath, 0)).rejects.toThrow("Resize rate must be between 0.1 and 10.0");
    await expect(resizeImage(testImagePath, 11)).rejects.toThrow("Resize rate must be between 0.1 and 10.0");
    
    // Invalid input type
    await expect(resizeImage(123 as any, 1.0)).rejects.toThrow("Input must be a Buffer, file path string, or base64 data URL");
    
    // Invalid data URL
    await expect(resizeImage("data:image/png;base64,invalid", 1.0)).rejects.toThrow();
  });
});


describe("toModelInputImage", () => {
  const testImagePath = path.join(process.cwd(), "lib", "agent", "coding", "testdata", "greeting.png");
  let testImageBase64: string;
  let testImageBuffer: Buffer;

  beforeAll(() => {
    // Load test image and convert to base64
    testImageBuffer = fs.readFileSync(testImagePath);
    testImageBase64 = testImageBuffer.toString("base64");
  });

  it("should return image as-is if under size limit (base64 input)", async () => {
    // Use a very high limit to ensure no resizing
    const result = await toModelInputImage({ 
      image: testImageBase64, 
      maxImageArea: 10000000 
    });
    
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("base64")).toBe(testImageBase64); // Should be unchanged
  });

  it("should return image as-is if under size limit (Buffer input)", async () => {
    // Use a very high limit to ensure no resizing
    const result = await toModelInputImage({ 
      image: testImageBuffer, 
      maxImageArea: 10000000 
    });
    
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("base64")).toBe(testImageBase64); // Should be unchanged
  });

  it("should resize image if over size limit (base64 input)", async () => {
    // Use a very low limit to force resizing
    const result = await toModelInputImage({ 
      image: testImageBase64, 
      maxImageArea: 1000 
    });
    
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("base64")).not.toBe(testImageBase64); // Should be different (resized)
    expect(result.length).toBeGreaterThan(0);
  });

  it("should resize image if over size limit (Buffer input)", async () => {
    // Use a very low limit to force resizing
    const result = await toModelInputImage({ 
      image: testImageBuffer, 
      maxImageArea: 1000 
    });
    
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("base64")).not.toBe(testImageBase64); // Should be different (resized)
    expect(result.length).toBeGreaterThan(0);
  });
});
