// Cursor Rule: Use Props Object Pattern
// Always use destructured object parameters instead of multiple individual parameters
// Example: function myFunc({ param1, param2, param3 }: { param1: string; param2?: number; param3: boolean })
// This improves readability, makes parameters self-documenting, and allows for easier parameter reordering

import "reflect-metadata";
import fs from "fs/promises";
import path from "path";

import { LanguageModelV2 } from "@ai-sdk/provider";
import { Octokit } from "@octokit/rest";
import { streamText, createUIMessageStream, stepCountIs, readUIMessageStream } from "ai";
import dotenv from "dotenv";
import { z } from "zod/v3";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { getConfig } from "@/lib/config";
import { DEFAULT_QA_MODEL } from "@/lib/consts";
import { getUserDataSource } from "@/lib/entities";
import logger from "@/lib/logger";
import { loadPackageMetadata, extractReactComponents, type ComponentLocator } from "@/lib/ui-catalog/package-util";
import { ComponentInfoSaveTool, getComponentInfoByName } from "@/lib/ui-catalog/ui-catalog";

/**
 * Tool for searching files by name or pattern in a directory
 */
class FileSearchTool extends BaseAgentTool {
  readonly name = "SearchFiles";
  readonly description = "Search for files by name or pattern in a directory relative to project root";
  
  readonly inputSchema = z.object({
    searchPath: z.string().describe("Directory path relative to project root (e.g., \"node_modules/@mantine/core\", \"src\", \"lib\")"),
    searchPattern: z.string().describe("File name pattern to search for (e.g., \"*.d.ts\", \"Button.d.ts\", \"**/*.tsx\")"),
    maxResults: z.number().default(10).describe("Maximum number of results to return")
  });

  protected async executeInternal({ searchPath, searchPattern, maxResults }: {
    searchPath: string;
    searchPattern: string;
    maxResults?: number;
  }) {
    const { default: glob } = await import("fast-glob");
    
    const basePath = path.resolve(process.cwd(), searchPath);
    
    // Check if the search path exists
    await fs.access(basePath);

    // Use fast-glob for powerful pattern matching
    const globPattern = path.join(basePath, searchPattern).replace(/\\/g, "/");
    
    const results = await glob(globPattern, {
      onlyFiles: true,
      absolute: true,
      caseSensitiveMatch: false
    });

    // Limit results and make paths relative to search path
    const limitedResults = results.slice(0, maxResults || 10);
    const relativeResults = await Promise.all(
      limitedResults.map(async (file) => ({
        relativePath: path.relative(basePath, file),
        absolutePath: file,
        size: await this.getFileSize(file)
      }))
    );
    
    return {
      searchPath,
      pattern: searchPattern,
      files: relativeResults,
      totalFound: limitedResults.length,
      totalScanned: results.length
    };
  }

  private async getFileSize(filePath: string): Promise<string> {
    try {
      const stats = await fs.stat(filePath);
      const bytes = stats.size;
      
      if (bytes === 0) return "0 B";
      
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    } catch {
      return "Unknown";
    }
  }
}

type GrepMatch = {
  file: string;
  lineNumber: number;
  line: string;
  context: string[];
};

type GrepResult = {
  searchPath: string;
  pattern: string;
  matches: GrepMatch[];
  totalMatches: number;
  filesSearched: number;
};

/**
 * Parse GitHub repository URL to extract owner and repo name
 */
export function parseGithubRepositoryUrl(repositoryUrl: string): { owner: string; repo: string } {
  // Handle various GitHub URL formats
  const githubMatch = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (!githubMatch) {
    throw new Error("Invalid GitHub repository URL format");
  }
  
  const [, owner, repoName] = githubMatch;
  // Remove .git suffix if present
  const repo = repoName.replace(/\.git$/, "");
  
  return { owner, repo };
}

/**
 * Tool for reading and searching text content in files using simple-grep
 */
class FileGrepTool extends BaseAgentTool {
  readonly name = "GrepFile";
  readonly description = "Search for text patterns in files using simple-grep utility";
  
  readonly inputSchema = z.object({
    searchPath: z.string().describe("File or directory path relative to project root to search in"),
    searchPattern: z.string().describe("Text pattern to search for"),
    contextLines: z.number().default(3).describe("Number of lines before/after match to include"),
    maxMatches: z.number().default(10).describe("Maximum number of matches to return"),
    filePattern: z.string().optional().describe("File pattern to filter results (e.g., \"*.ts\", \"*.d.ts\")")
  });

  private readonly DEFAULT_MAX_MATCHES = 10;

  protected async executeInternal({ searchPath, searchPattern, maxMatches, filePattern }: {
    searchPath: string;
    searchPattern: string;
    contextLines?: number;
    maxMatches?: number;
    filePattern?: string;
  }) {
    const simpleGrep = await import("simple-grep");
    const { default: glob } = await import("fast-glob");
    
    const fullSearchPath = path.resolve(process.cwd(), searchPath);
    const maxResults = maxMatches || this.DEFAULT_MAX_MATCHES;
    
    await fs.access(fullSearchPath);
    const stats = await fs.stat(fullSearchPath);
    
    if (stats.isFile() || !filePattern) {
      return this.searchTarget(simpleGrep.default, stats.isFile() ? fullSearchPath : fullSearchPath, searchPattern, maxResults, fullSearchPath);
    }

    // Handle directory with file pattern
    const pattern = path.join(fullSearchPath, "**", filePattern).replace(/\\/g, "/");
    
    const allFiles = await glob(pattern, {
      onlyFiles: true,
      absolute: true
    });
    
    if (allFiles.length === 0) {
      return this.buildResult(fullSearchPath, searchPattern, [], 0);
    }
    
    const allMatches: GrepMatch[] = [];
    for (const filePath of allFiles) {
      if (allMatches.length >= maxResults) break;
      
      try {
        const fileMatches = await this.searchFile(simpleGrep.default, filePath, searchPattern);
        allMatches.push(...fileMatches.slice(0, maxResults - allMatches.length));
      } catch {
        continue; // Skip files that can"t be searched
      }
    }
    
    return this.buildResult(fullSearchPath, searchPattern, allMatches, allFiles.length);
  }

  private async searchTarget(simpleGrep: any, target: string, searchPattern: string, maxMatches: number, fullSearchPath: string): Promise<GrepResult> {
    return new Promise((resolve) => {
      simpleGrep(searchPattern, target, (results: any[]) => {
        const matches = this.processGrepResults(results, maxMatches);
        resolve(this.buildResult(fullSearchPath, searchPattern, matches, results.length));
      });
    });
  }

  private async searchFile(simpleGrep: any, filePath: string, searchPattern: string): Promise<GrepMatch[]> {
    return new Promise((resolve) => {
      simpleGrep(searchPattern, filePath, (results: any[]) => {
        resolve(results?.length ? this.processGrepResults(results, this.DEFAULT_MAX_MATCHES) : []);
      });
    });
  }

  private processGrepResults(results: any[], maxMatches: number): GrepMatch[] {
    const matches: GrepMatch[] = [];
    
    for (const result of results) {
      if (matches.length >= maxMatches) break;
      
      for (const match of result.results) {
        if (matches.length >= maxMatches) break;
        
        matches.push({
          file: path.relative(process.cwd(), result.file),
          lineNumber: parseInt(match.line_number),
          line: match.line,
          context: [match.line]
        });
      }
    }
    
    return matches;
  }

  private buildResult(fullSearchPath: string, searchPattern: string, matches: GrepMatch[], filesSearched: number): GrepResult {
    return {
      searchPath: path.relative(process.cwd(), fullSearchPath),
      pattern: searchPattern,
      matches,
      totalMatches: matches.length,
      filesSearched
    };
  }
}


/**
 * Tool for searching code within a specific GitHub repository
 */
class GithubSearchCodeTool extends BaseAgentTool {
  readonly name = "SearchGitHubCode";
  readonly description = "Search for code patterns within a specific GitHub repository";
  
  readonly inputSchema = z.object({
    repositoryUrl: z.string().describe("GitHub repository URL (e.g., \"https://github.com/mantinedev/mantine.git\")"),
    query: z.string().describe("Search query (e.g., \"Button component\", \"useState\", \"function myFunction\")"),
    maxResults: z.number().default(10).describe("Maximum number of results to return (max 100)")
  });

  private octokit: any;

  constructor() {
    super();
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  protected async executeInternal({ repositoryUrl, query, maxResults }: {
    repositoryUrl: string;
    query: string;
    maxResults?: number;
  }) {
    // Parse repository info from URL
    const { owner: repoOwner, repo: repoName } = parseGithubRepositoryUrl(repositoryUrl);
    
    // Search within the specific repository
    const searchQuery = `${query} repo:${repoOwner}/${repoName}`;
    
    const result = await this.octokit.rest.search.code({
      q: searchQuery,
      per_page: Math.min(maxResults || 10, 100) // GitHub API limits code search to 100
    });

    return {
      codeMatches: result.data.items.map((item: any) => ({
        name: item.name,
        path: item.path,
        repository: {
          name: item.repository.name,
          fullName: item.repository.full_name,
          owner: item.repository.owner.login,
          url: item.repository.html_url
        },
        url: item.html_url,
        score: item.score
      })),
      totalCount: result.data.total_count,
      query: searchQuery,
      repository: { owner: repoOwner, name: repoName }
    };
  }
}

/**
 * Tool for reading files from GitHub repositories
 */
class GithubReadFileTool extends BaseAgentTool {
  readonly name = "ReadGitHubFile";
  readonly description = "Read file contents from a GitHub repository";
  
  readonly inputSchema = z.object({
    repositoryUrl: z.string().describe("GitHub repository URL (e.g., \"https://github.com/mantinedev/mantine.git\")"),
    filePath: z.string().describe("File path (e.g., \"src/index.ts\", \"README.md\")"),
    branch: z.string().optional().describe("Branch name (defaults to main/master)")
  });

  private octokit: any;

  constructor() {
    super();
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  protected async executeInternal({ repositoryUrl, filePath, branch }: {
    repositoryUrl: string;
    filePath: string;
    branch?: string;
  }) {
    // Parse repository info from URL
    const { owner: repoOwner, repo: repoName } = parseGithubRepositoryUrl(repositoryUrl);

    // Get default branch if not specified
    if (!branch) {
      const repoInfo = await this.octokit.rest.repos.get({
        owner: repoOwner,
        repo: repoName
      });
      branch = repoInfo.data.default_branch;
    }

    const result = await this.octokit.rest.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: filePath,
      ref: branch
    });

    if (Array.isArray(result.data)) {
      throw new Error(`Path ${filePath} is a directory, not a file`);
    }

    const content = Buffer.from(result.data.content, "base64").toString("utf-8");
    return {
      content: content.slice(0, 50000), // Limit content length to 50KB
      filePath,
      branch,
      size: result.data.size,
      repository: {
        owner: repoOwner,
        name: repoName,
        fullName: `${repoOwner}/${repoName}`
      },
      url: result.data.html_url
    };
  }
}

/**
 * Research a component to understand what it does and how to use it
 */
export async function researchComponent({
  componentLocator,
  model
}: {
  componentLocator: ComponentLocator;
  model?: LanguageModelV2;
}): Promise<string> {
  // Use default model if not provided
  const defaultModel = model || DEFAULT_QA_MODEL;

  const { name, packageMetadata } = componentLocator;
  const homepage = packageMetadata.homepage;
  const repository = typeof packageMetadata.repository === "string" 
    ? packageMetadata.repository 
    : packageMetadata.repository?.url;

  const systemPrompt = `You are a component research AI. Your task is to thoroughly research a React component to understand:

1. What the component does (enhanced description)
2. How to use it properly (detailed usage patterns)
3. Available props and types (from .d.ts files)
4. Real-world examples
5. Best practices and common patterns

Component to research:
- Name: ${name}
- Package: ${packageMetadata.name}
- Is Default Export: ${componentLocator.isDefaultExport}

Available resources:
- TypeScript definitions in node_modules
${homepage ? `- Documentation website: ${homepage}` : ""}
${repository ? `- Source repository: ${repository}` : ""}

Research process:
1. First, search for (component name).d.ts files for this component to understand its TypeScript definitions
   - Use SearchFiles with searchPath like "node_modules/${packageMetadata.name}" and pattern "**/*.d.ts"
   - Look specifically for files containing the component name
2. If a source repository is available, search for code examples and usage patterns within that repository
   - Use SearchGitHubCode with repositoryUrl and queries like "${name}" or "example"
   - Look for real-world implementations, tests, and documentation
3. If you find interesting files from GitHub search, read them for detailed examples
   - Use ReadGitHubFile with repositoryUrl and filePath from the search results
4. Once you have gathered comprehensive information, store the component knowledge using StoreComponentInfo
   - Include relevant keywords that would help developers find this component
   - Store the complete profile document with all research findings
5. Synthesize all information into a comprehensive component profile

Additional instructions:
- If a tool returns an error, don't repeat the same input.
- When browsing Github, always use the search results to find the most relevant files.
- Always use StoreComponentInfo to save your research findings to the database.

Generate a comprehensive information card to help coding AI use this component.`;

  // Get the user's data source
  const dataSource = await getUserDataSource();

  const tools = {
    SearchFiles: new FileSearchTool(),
    GrepFile: new FileGrepTool(),
    SearchGitHubCode: new GithubSearchCodeTool(),
    ReadGitHubFile: new GithubReadFileTool(),
    StoreComponentInfo: new ComponentInfoSaveTool(dataSource)
  };

  // Create a data stream compatible with agentStreamToMessage
  const dataStream = createUIMessageStream({
    execute: async (dataStreamWriter: any) => {
      const stream = streamText({
        model: defaultModel,

        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Please research the following component thoroughly and store the information in the database:
              ${JSON.stringify({
    name,
    packageName: packageMetadata.name,
    packageVersion: packageMetadata.version,
    isDefaultExport: componentLocator.isDefaultExport
  }, null, 2)}`
          }
        ],

        tools,
        stopWhen: stepCountIs(30)
      });
      
      stream.toUIMessageStream(dataStreamWriter);
    },
    onError: (error) => {
      logger.error(`Research stream error: ${error instanceof Error ? error.message : String(error)}`);
      return `Component research error: ${error}`;
    }
  });

  // Use readUIMessageStream to get the final result
  let result = null;
  const messageStream = readUIMessageStream({ stream: dataStream });
  for await (const message of messageStream) {
    result = message;
  }
  
  if (!result) {
    throw new Error("No message received from stream");
  }
  
  // Return the raw response directly
  const textParts = result.parts?.filter(part => part.type === "text") || [];
  return textParts.map(part => part.text).join("");
}

/**
 * Filter out components that are already known/researched in the database
 */
async function filterKnownComponents(componentLocators: ComponentLocator[], dataSource: any): Promise<ComponentLocator[]> {
  logger.info("Checking which components are already in database...");
  
  const componentsToResearch = [];
  const alreadyInDb = [];

  for (const locator of componentLocators) {
    const existing = await getComponentInfoByName(locator.name, dataSource);
    if (existing && existing.packageName === locator.packageMetadata.name && existing.packageVersion === locator.packageMetadata.version) {
      alreadyInDb.push(locator.name);
    } else {
      componentsToResearch.push(locator);
    }
  }

  if (alreadyInDb.length > 0) {
    logger.info(`Skipping ${alreadyInDb.length} components already in database: ${alreadyInDb.join(", ")}`);
  }

  return componentsToResearch;
}

/**
 * Research multiple components from a package
 */
async function researchPackageComponents(packageName: string): Promise<void> {
  logger.info(`Extracting all React components from ${packageName}...`);
  
  const componentLocators = await extractReactComponents(packageName);
  
  if (componentLocators.length === 0) {
    logger.warn(`No React components found in ${packageName}`);
    process.exit(1);
  }

  logger.info(`Found ${componentLocators.length} components: ${componentLocators.map(c => c.name).join(", ")}`);

  // Get the user's data source
  const dataSource = await getUserDataSource();
  const componentsToResearch = await filterKnownComponents(componentLocators, dataSource);

  if (componentsToResearch.length === 0) {
    logger.info("All components from this package are already researched!");
    return;
  }

  logger.info(`Researching ${componentsToResearch.length} new components...`);

  // Research components in loop with error handling
  for (let i = 0; i < componentsToResearch.length; i++) {
    const locator = componentsToResearch[i];
    logger.info(`[${i + 1}/${componentsToResearch.length}] Researching ${locator.name}...`);

    try {
      await researchComponent({ componentLocator: locator });
      logger.info(`Research completed for ${locator.name}!`);
    } catch (error) {
      logger.error(`Research failed for ${locator.name}: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with next component
    }
  }
  
  logger.info(`Package research completed! Researched ${componentsToResearch.length} components.`);
}

/**
 * Main function for testing researchComponent from terminal
 * Usage: 
 *   npx tsx package-indexer.ts                                - Research all configured packages
 *   npx tsx package-indexer.ts <packageName> <componentName>  - Research specific component
 *   npx tsx package-indexer.ts <packageName>                  - Research all components in package
 * Examples: 
 *   npx tsx package-indexer.ts                                - Research all packages from config
 *   npx tsx package-indexer.ts @mantine/core Button
 *   npx tsx package-indexer.ts @mantine/core                  - Research all components
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const [packageName, componentName] = args;
    
    // Determine packages to process
    const packagesToProcess = args.length === 0 ? Object.keys(getConfig().packages) : [packageName];
    
    if (packagesToProcess.length === 0) {
      logger.warn("No packages configured in config.packages");
      process.exit(1);
    }

    if (packagesToProcess.length > 1) {
      logger.info(`Researching all configured packages: ${packagesToProcess.join(", ")}`);
    }

    // Process each package
    for (let i = 0; i < packagesToProcess.length; i++) {
      const currentPackageName = packagesToProcess[i];
      
      if (packagesToProcess.length > 1) {
        logger.info(`[${i + 1}/${packagesToProcess.length}] Processing package: ${currentPackageName}`);
      }
      
      try {
        const { targetPackage } = await loadPackageMetadata(currentPackageName);
        if (!targetPackage) {
          throw new Error(`Package ${currentPackageName} not found. Please install it first: npm install ${currentPackageName}`);
        }

        if (componentName) {
          // Research specific component (only valid for single package)
          logger.info(`Component: ${componentName}`);
          
          const componentLocator = {
            name: componentName,
            isDefaultExport: false, // Default to false, actual value would need to be determined
            packageMetadata: targetPackage
          };
          await researchComponent({ componentLocator });
          
          logger.info("Research completed!");
        } else {
          // Research all components in package
          await researchPackageComponents(currentPackageName);
        }
      } catch (error) {
        logger.error(`Failed to research package ${currentPackageName}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with next package if processing multiple
        if (packagesToProcess.length === 1) {
          process.exit(1);
        }
      }
    }
    
    if (packagesToProcess.length > 1) {
      logger.info("Completed researching all configured packages!");
    }

  } catch (error) {
    logger.error(`Error during component research: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Export classes for testing
export { FileSearchTool, FileGrepTool, GithubSearchCodeTool, GithubReadFileTool };

// Run main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Load environment variables from .env.local
  dotenv.config({ path: ".env.local", debug: false });
  
  main().catch((error) => {
    logger.error("Unhandled error:", error);
    process.exit(1);
  });
}
