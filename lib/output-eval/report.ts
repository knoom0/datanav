import { anthropic } from "@ai-sdk/anthropic";

import { GEval } from "@/lib/agent/core/g-eval";

/**
 * GEval configuration for evaluating report outputs.
 * 
 * This evaluator assesses AI data analysis report outputs based on six key criteria:
 * 1. Actionable Insights - Identifies up to 3 high-impact, actionable insights
 * 2. Visual Communication - Ensures effective use of charts and visuals
 * 3. Relevance and Focus - Ensures content relates directly to key insights
 * 4. Clarity and Simplicity - Ensures concise, jargon-free communication
 * 5. Narrative Engagement - Ensures a coherent story connecting data to insights
 * 6. Context Alignment - Ensures findings connect to user's long-term objectives
 * 
 * Each criterion is scored 0-5, with detailed scoring guidelines provided.
 */
export const REPORT_EVAL = new GEval({
  name: "AI Data Analysis Report Output Evaluator",
  model: anthropic("claude-3-7-sonnet-20250219"),
  criteria: [
    `Actionable Insights (0-5):
- Goal: Ensure the report identifies and communicates up to 3 high-impact, actionable insights.
- The report clearly lists or emphasizes no more than 3 key insights.
- Each insight is actionable (i.e., suggests a next step, decision, or behavioral change).
- If no significant insight exists, the report explicitly states that no actionable insights were found, rather than filling space with minor observations.
- Scoring:
  * 5: Up to 3 well-defined, high-impact, actionable insights.
  * 3: Some insights actionable but vague or exceeding 3 in number.
  * 1: Insights missing or replaced by trivial facts.
  * 0: No insight section or unclear findings.`,

    `Visual Communication (0-5):
- Goal: Ensure visual elements (charts, cards, summaries) are used effectively to clarify insights.
- Visuals directly support key insights (not decorative).
- Visuals summarize quantitative or trend information at a glance.
- Layout and labeling are clear, concise, and readable.
- Scoring:
  * 5: Visuals clearly enhance understanding of each main point.
  * 3: Some visuals relevant but under-explained or cluttered.
  * 1: Minimal or unclear visuals; text-only presentation.
  * 0: No visuals included.`,

    `Relevance and Focus (0-5):
- Goal: Ensure all report content directly relates to the key insights.
- Each paragraph, visual, or section contributes to explaining or contextualizing an insight.
- No unrelated metrics, tangential commentary, or raw data dumps.
- Scoring:
  * 5: Fully focused; every element contributes meaningfully.
  * 3: Minor irrelevant information or filler present.
  * 1: Noticeable digressions; lacks focus.
  * 0: Mostly off-topic or unfocused content.`,

    `Clarity and Simplicity (0-5):
- Goal: Ensure the report is concise, jargon-free, and easy to understand.
- Uses plain language and avoids technical jargon.
- Summarizes findings in short, direct sentences.
- Uses clear headings and structured layout.
- Scoring:
  * 5: Effortlessly readable by a non-expert.
  * 3: Mostly clear but contains some complexity or unnecessary length.
  * 1: Confusing or jargon-heavy.
  * 0: Largely unreadable.`,

    `Narrative Engagement (0-5):
- Goal: Ensure the report tells a coherent story connecting data to insights.
- Report flows logically (context → observation → insight → implication).
- Transitions and phrasing make it engaging, not robotic.
- Includes a sense of discovery or meaning rather than just listing data.
- Scoring:
  * 5: Strong narrative arc; naturally engaging.
  * 3: Some storytelling elements present but uneven.
  * 1: Dry, mechanical structure.
  * 0: No narrative coherence.`,

    `Context Alignment (0-5):
- Goal: Ensure the findings connect to the user's long-term objectives or goals.
- The report references relevant personal, business, or project goals.
- Insights are framed in terms of long-term progress or strategy.
- Avoids isolated observations without user context.
- Scoring:
  * 5: Clear, consistent link to user's overarching objectives.
  * 3: Partial or implicit link to long-term goals.
  * 1: Mentions goals but with no real alignment.
  * 0: No connection to user context.`
  ],
  threshold: 0.7
});

