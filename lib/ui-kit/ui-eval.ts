import { GEval } from "@/lib/agent/core/g-eval";

// You must set the model property before using AlignmentEval
export const DesignAlignmentEval = new GEval({
  name: "Design Alignment Evaluator",
  criteria: [
    "Layout Alignment: The generated UI layout structure, positioning, spacing, and overall arrangement should closely match the input image layout",
    "Visual Style Alignment: Colors, typography (font sizes, weights, styles), and visual styling should align with the input image appearance",
    "Component Presence: All major UI components visible in the input image (buttons, lists, charts, navigation, forms, etc.) should exist in the output image",
    "Note: Data content differences between input and output images are acceptable and should not negatively impact the evaluation score"
  ],
  threshold: 0.7,
});
