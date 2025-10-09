// Vitest evaluation module for CodeAgent
// This is for evaluation, not strict unit testing. It runs CodeAgent on a set of inputs and prints the outputs for inspection.

import * as fs from "fs";
import * as path from "path";

import { describe, it, expect } from "vitest";

import "@/instrumentation" 
import { CodeAgent } from "@/lib/agent/coding/code-agent";
import { agentStreamToMessage } from "@/lib/agent/core/agent";
import logger from "@/lib/logger";
import { Project } from "@/lib/types";
import { DesignAlignmentEval } from "@/lib/ui-kit/ui-eval";
import { putUIBundle } from "@/lib/ui-kit/ui-repo";
import { getPreviewUrl, previewUI } from "@/lib/ui-kit/ui-tester";
import { logToConsole, generateCurrentMonthDate } from "@/lib/ui-kit/ui-utils";

const mockDataSpec = {
  type: "data_spec" as const,
  queries: [
    {
      name: "accountBalances",
      description: "Get a list of account balances for all user accounts",
      query: "SELECT account_id, account_name, account_type, balance, currency FROM accounts;",
      columnInfos: [
        { name: "account_id", dataType: "number" as const, description: "Unique identifier for the account" },
        { name: "account_name", dataType: "string" as const, description: "Display name of the account" },
        { name: "account_type", dataType: "string" as const, description: "Type of account (checking, savings, credit)" },
        { name: "balance", dataType: "number" as const, description: "Current balance of the account" },
        { name: "currency", dataType: "string" as const, description: "Currency code (e.g., USD)" }
      ],
      sampleData: [
        { account_id: 1, account_name: "Checking Account", account_type: "checking", balance: 2500.50, currency: "USD" },
        { account_id: 2, account_name: "Savings Account", account_type: "savings", balance: 15000.00, currency: "USD" },
        { account_id: 3, account_name: "Credit Card", account_type: "credit", balance: -1250.75, currency: "USD" }
      ]
    },
    {
      name: "transactions",
      description: "Get a list of transactions for all accounts",
      query: "SELECT transaction_id, account_id, date, amount, description, category, merchant, location, payment_method, tags, notes, receipt_url FROM transactions;",
      columnInfos: [
        { name: "transaction_id", dataType: "number" as const, description: "Unique identifier for the transaction" },
        { name: "account_id", dataType: "number" as const, description: "ID of the account associated with this transaction" },
        { name: "date", dataType: "string" as const, description: "Date of the transaction" },
        { name: "amount", dataType: "number" as const, description: "Transaction amount (negative for expenses, positive for income)" },
        { name: "description", dataType: "string" as const, description: "Description of the transaction" },
        { name: "category", dataType: "string" as const, description: "Category of the transaction" },
        { name: "merchant", dataType: "string" as const, description: "Merchant name" },
        { name: "location", dataType: "string" as const, description: "Location where the transaction occurred" },
        { name: "payment_method", dataType: "string" as const, description: "Method of payment (debit, credit, cash, etc.)" },
        { name: "tags", dataType: "string" as const, description: "Comma-separated tags for categorization" },
        { name: "notes", dataType: "string" as const, description: "Additional notes about the transaction" },
        { name: "receipt_url", dataType: "string" as const, description: "URL to the receipt image (if available)" }
      ],
      // Note: Dates are generated dynamically using generateCurrentMonthDate() with day numbers
      // This ensures sample data always contains current month dates with realistic timing throughout the month
      sampleData: [
        { transaction_id: 1, account_id: 1, date: generateCurrentMonthDate(3), amount: -4.50, description: "Starbucks Coffee", category: "Food & Drink", merchant: "Starbucks", location: "Downtown", payment_method: "debit", tags: "coffee,morning", notes: "Daily coffee", receipt_url: null },
        { transaction_id: 2, account_id: 1, date: generateCurrentMonthDate(6), amount: -45.99, description: "Grocery Shopping", category: "Groceries", merchant: "Whole Foods", location: "Main St", payment_method: "debit", tags: "groceries,weekly", notes: "Weekly shopping", receipt_url: null },
        { transaction_id: 3, account_id: 2, date: generateCurrentMonthDate(1), amount: 2500.00, description: "Salary Deposit", category: "Income", merchant: "ABC Corp", location: null, payment_method: "direct_deposit", tags: "salary,income", notes: "Monthly salary", receipt_url: null },
        { transaction_id: 4, account_id: 3, date: generateCurrentMonthDate(9), amount: -89.99, description: "Online Shopping", category: "Shopping", merchant: "Amazon", location: null, payment_method: "credit", tags: "online,electronics", notes: "New headphones", receipt_url: null },
        { transaction_id: 5, account_id: 1, date: generateCurrentMonthDate(13), amount: -25.00, description: "Gas Station", category: "Transportation", merchant: "Shell", location: "Highway 101", payment_method: "debit", tags: "gas,car", notes: "Weekly gas fill-up", receipt_url: null }
      ]
    },
    {
      name: "categories",
      description: "Get all transaction categories",
      query: "SELECT category_id, name, icon FROM categories;",
      columnInfos: [
        { name: "category_id", dataType: "number" as const, description: "Unique identifier for the category" },
        { name: "name", dataType: "string" as const, description: "Display name of the category" },
        { name: "icon", dataType: "string" as const, description: "Emoji icon representing the category" }
      ],
      sampleData: [
        { category_id: 1, name: "Food & Drink", icon: "🍽️" },
        { category_id: 2, name: "Groceries", icon: "🛒" },
        { category_id: 3, name: "Income", icon: "💰" },
        { category_id: 4, name: "Shopping", icon: "🛍️" },
        { category_id: 5, name: "Transportation", icon: "🚗" },
        { category_id: 6, name: "Entertainment", icon: "🎬" },
        { category_id: 7, name: "Utilities", icon: "⚡" },
        { category_id: 8, name: "Healthcare", icon: "🏥" }
      ]
    }
  ]
};

async function readTestDataImage(filename: string): Promise<string> {
  const imagePath = path.join(process.cwd(), "lib", "agent", "coding", "testdata", filename);
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
}

// Define your test cases
const testCases: { 
  name: string; 
  referenceImage: string;
  userPrompt: string;
  prd: string;
}[] = [
  {
    name: "A simple greeting",
    referenceImage: "greeting.png",
    userPrompt: "Create a React component that displays a greeting message.",
    prd: `## Key Requirements
- Create a simple React component that displays a greeting message
- Component should be reusable and easy to integrate
- Message should be friendly and welcoming

## Solution Idea
Build a functional React component that renders a personalized greeting message with clean, readable styling.

## Data Requirements
- No external data sources required
- Component may accept optional props for customization (name, greeting type)

## UI Requirements
- Clean, readable typography
- Friendly and welcoming visual design
- Responsive layout that works across screen sizes
- Minimal styling that fits modern UI standards`
  },
  {
    name: "A simple list UI",
    referenceImage: "list.png",
    userPrompt: "Create a mobile financial app transaction list with filtering capabilities.",
    prd: `## Key Requirements
- Display transactions from both bank accounts and credit cards in a unified list
- Provide filtering capabilities by account type, date range, and transaction category
- Mobile-optimized interface with touch-friendly interactions
- Show transaction details including name, date, amount, category icon, and account type

## Solution Idea
Create a comprehensive transaction list screen with an integrated filtering system. The screen will display all user transactions in a scrollable list with filter controls at the top, allowing users to quickly find and review their financial activity across different accounts and categories.

## Data Requirements
- Access to transaction data via DataProxy interface including:
  * Transaction ID, account ID, date, amount, description
  * Category information with icons
  * Account type indicators (bank account vs credit card)
  * Payment method details
- Support for real-time data filtering and sorting
- Category data for filter options and visual icons

## UI Requirements
- **Transaction List**: Scrollable list displaying all transactions with clear visual separation
- **Transaction Items**: Each item displays transaction name, date, amount, category icon, and account type indicator
- **Filter Section**: Collapsible or persistent filter controls for account type, date range, and category selection
- **Mobile Design**: Touch-friendly interface with appropriate tap targets and spacing
- **Visual Design**: Modern, clean interface with soft colors, rounded cards, and clear typography
- **Responsive Layout**: Optimized for mobile screens with good spacing and readability
- **Accessibility**: High contrast ratios and screen reader compatibility`
  },
  {
    name: "A simple details UI",
    referenceImage: "details.png",
    userPrompt: "Create a mobile transaction details screen for a financial app.",
    prd: `## Key Requirements
- Display comprehensive details for a single transaction
- Allow editing of transaction notes, tags, and categories
- Provide receipt management functionality (add/view receipts)
- Mobile-optimized interface with intuitive navigation
- Support both bank account and credit card transactions

## Solution Idea
Create a detailed transaction view screen that serves as both an information display and editing interface. Users can view all transaction details at a glance and make modifications to personalizable fields like notes, tags, and categories. The screen will also handle receipt attachments for better expense tracking.

## Data Requirements
- Access to complete transaction details via DataProxy interface:
  * Transaction ID, amount, date/time, description
  * Merchant name and location information
  * Payment method and account details
  * Category assignment with icon
  * User-generated notes and tags
- Receipt storage and retrieval capabilities
- Category data for editing options

## UI Requirements
- **Information Display**: Clear presentation of transaction name, date/time, amount with debit/credit styling
- **Account Information**: Payment method indicator with appropriate icons (bank/credit card)
- **Category Section**: Category display with icon and editing capability
- **Merchant Details**: Merchant name and location when available
- **Editable Fields**: Notes section and tags with inline editing
- **Receipt Management**: Upload button and image preview for receipts
- **Mobile Design**: Touch-friendly with appropriate spacing and tap targets
- **Visual Hierarchy**: Clear information grouping with minimalist, accessible design
- **Navigation**: Easy return to previous screen with save/cancel actions for edits`
  },
  {
    name: "A pie chart UI",
    referenceImage: "chart_1.png",
    userPrompt: "Create a mobile spending analytics screen with pie chart and month navigation.",
    prd: `## Key Requirements
- Display spending distribution by category using a pie chart visualization
- Provide month navigation controls for time-based analysis
- Show category breakdown with amounts and percentages
- Mobile-optimized interface with touch-friendly interactions
- Focus on visual clarity and data comprehension

## Solution Idea
Create a focused analytics screen that combines a prominent pie chart with intuitive month navigation. The screen will display spending patterns in a visually appealing way, allowing users to easily understand their spending habits across different categories and time periods.

## Data Requirements
- Access to transaction data aggregated by category and month via DataProxy interface
- Category information including names, icons, and color associations
- Monthly spending totals and category breakdowns
- Support for different time period selections
- Calculated percentages for each spending category

## UI Requirements
- **Month Navigation**: Header controls with left/right arrows and month display (e.g., "June 2025")
- **Pie Chart**: Large, interactive chart showing spending distribution with color-coded slices
- **Category Legend**: List or legend showing category names with amounts and percentages
- **Visual Design**: Clean, minimal layout with soft color tones and rounded elements
- **Mobile Optimization**: Touch-friendly navigation and appropriately sized chart for mobile viewing
- **Interactivity**: Chart should respond to touch with potential hover/tap details
- **Accessibility**: High contrast colors and screen reader support for chart data
- **Layout**: Generous padding and spacing for clean, readable presentation`
  },
  {
    name: "A line chart UI",
    referenceImage: "chart_2.png",
    userPrompt: "Create a mobile net worth tracking screen with line chart and time range controls.",
    prd: `## Key Requirements
- Display net worth changes over time using a line chart visualization
- Provide time range selection controls (1M, 3M, 6M, 1Y, All)
- Show interactive data points with detailed information on touch
- Mobile-optimized interface with smooth interactions
- Track and visualize financial progress trends

## Solution Idea
Create a comprehensive net worth tracking screen that serves as a financial dashboard. The screen will feature a prominent line chart showing net worth progression over time, combined with flexible time range controls. Users can easily switch between different time periods to analyze their financial growth patterns and identify trends.

## Data Requirements
- Access to historical net worth data via DataProxy interface across multiple time periods
- Account balance data aggregated over time
- Asset and liability information for net worth calculations
- Time-series data supporting different granularities (daily, weekly, monthly)
- Data points with timestamps for precise chart plotting

## UI Requirements
- **Line Chart**: Interactive graph with smooth lines, subtle gridlines, and clear data points
- **Time Range Controls**: Segmented buttons or dropdown for period selection (1M, 3M, 6M, 1Y, All)
- **Data Interaction**: Touch-responsive chart with tooltips or markers showing specific values
- **Trend Visualization**: Clear indication of positive/negative trends with appropriate color coding
- **Mobile Design**: Touch-friendly interface optimized for mobile screens with appropriate scaling
- **Visual Design**: Minimalist layout with soft colors, rounded edges, and generous spacing
- **Responsive Elements**: Smooth animations and transitions for time range changes
- **Accessibility**: Screen reader support for chart data and high contrast visual elements
- **Performance**: Efficient rendering for large datasets across different time ranges`
  },
];

describe.sequential("CodeAgent eval", () => {
  testCases.forEach(({ name, referenceImage, userPrompt, prd }) => {
    it(name, async () => {
      const project = new Project("");
      project.put(mockDataSpec);
      project.put({
        type: "prd",
        text: prd
      });
      project.put({
        type: "design",
        images: [{
          imageBase64: await readTestDataImage(referenceImage),
          description: "Reference image for " + name
        }]
      });
            
      const agent = new CodeAgent({ project });
      const stream = agent.stream({
        messages: [
          {
            role: "user",
            content: userPrompt
          }
        ],
        onError: (error) => {
          logToConsole(error);
        }
      });
      await agentStreamToMessage(stream);

      // Get the UI bundle that CodeAgent generated (evaluation assumes success)
      const validUIBundle = project.getUIBundle()!;
      await putUIBundle(validUIBundle);
      const previewUrl = getPreviewUrl(validUIBundle.uuid);
      logger.info(`Preview your UI at: ${previewUrl}`);

      logger.info("Evaluating design alignment...");
      const screenshot = await previewUI(validUIBundle);
      const actualOutputImageBase64 = screenshot.toString("base64");
      const referenceImageBase64 = await readTestDataImage(referenceImage);
      const evaluationResult = await DesignAlignmentEval.measure({
        input: userPrompt,
        inputImage: referenceImageBase64,
        actualOutputImage: actualOutputImageBase64,
        additionalContext: `Test case: ${name}`
      });
      logger.info(`Evaluation result: ${evaluationResult}`);

      expect(evaluationResult.score).toBeGreaterThanOrEqual(DesignAlignmentEval.threshold);
    }, 30 * 60 * 1000); // Allow up to 30 minutes per eval
  });
}); 