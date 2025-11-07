import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { readUIMessageStream } from "ai";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import { DataSource, In } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { getConfig } from "@/lib/config";
import { PulseConfigEntity, PulseJobEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import { Chatbot } from "@/lib/meta-agent/chatbot";
import { ReportStore } from "@/lib/report";
import { Project, type Report, type ReportBundle } from "@/lib/types";
import { getCurrentUserEmail } from "@/lib/util/auth-util";
import { safeErrorString } from "@/lib/util/log-util";

export const PulseJobState = {
  CREATED: "created",
  RUNNING: "running",
  FINISHED: "finished"
} as const;

export const PulseJobResult = {
  SUCCESS: "success",
  ERROR: "error",
  CANCELED: "canceled"
} as const;

export type PulseJobStateType = typeof PulseJobState[keyof typeof PulseJobState];
export type PulseJobResultType = typeof PulseJobResult[keyof typeof PulseJobResult];

export interface CreatePulseJobParams {
  pulseConfigId: string;
}

export interface RunPulseJobResult {
  job: PulseJobEntity;
  nextJobIds: string[];
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  htmlContent: string;
}

export class PulseJobScheduler {
  private dataSource: DataSource;
  private maxJobDurationMs: number;
  private baseUrl?: string;

  constructor(params: { dataSource: DataSource; baseUrl?: string }) {
    this.dataSource = params.dataSource;
    this.baseUrl = params.baseUrl;

    // Get max duration from config
    const config = getConfig();
    this.maxJobDurationMs = config.job.maxJobDurationMs;
  }

  /**
   * Updates job state and result, then saves it
   */
  private async updateJobState(params: {
    job: PulseJobEntity;
    state: PulseJobStateType;
    result: PulseJobResultType | null;
    startedAt?: Date;
    finishedAt?: Date;
  }): Promise<void> {
    const { job, state, result, startedAt, finishedAt } = params;
    job.state = state;
    job.result = result;
    
    if (startedAt !== undefined) {
      job.startedAt = startedAt;
    }
    
    if (finishedAt !== undefined) {
      job.finishedAt = finishedAt;
    }
    
    await this.dataSource.getRepository(PulseJobEntity).save(job);
  }

  /**
   * Stops a job by updating its state
   * Can be used for error, canceled, or other terminal states
   */
  private async stopJob(params: {
    job: PulseJobEntity;
    result: PulseJobResultType;
    error?: string;
  }): Promise<void> {
    const { job, result, error } = params;
    logger.info(`Stopping pulse job ${job.id} with result: ${result}`);

    // Set error message if provided
    if (error) {
      job.error = error;
    }

    // Update job state to finished with the specified result and finished time
    await this.updateJobState({ 
      job, 
      state: PulseJobState.FINISHED, 
      result,
      finishedAt: new Date()
    });

    logger.info(`Pulse job ${job.id} stopped with result: ${result}`);
  }

  /**
   * Cancels a job by marking it as canceled
   */
  private async cancelJob(params: { job: PulseJobEntity }): Promise<void> {
    await this.stopJob({ job: params.job, result: PulseJobResult.CANCELED });
  }

  /**
   * Creates a new pulse job
   * @returns ID of the newly created job
   */
  async create(params: CreatePulseJobParams): Promise<string> {
    const { pulseConfigId } = params;

    logger.info(`Creating new pulse job for config ${pulseConfigId}`);

    const jobRepo = this.dataSource.getRepository(PulseJobEntity);
    const configRepo = this.dataSource.getRepository(PulseConfigEntity);

    // Verify pulse config exists and is enabled
    const config = await configRepo.findOne({ where: { id: pulseConfigId } });
    if (!config) {
      throw new Error(`Pulse config ${pulseConfigId} not found`);
    }

    // Cancel any existing unfinished jobs for this pulse config
    const unfinishedJobs = await jobRepo.find({
      where: {
        pulseConfigId,
        state: In([PulseJobState.CREATED, PulseJobState.RUNNING])
      }
    });

    if (unfinishedJobs.length > 0) {
      logger.info(`Canceling ${unfinishedJobs.length} existing unfinished job(s) for pulse config ${pulseConfigId}`);
      for (const existingJob of unfinishedJobs) {
        await this.cancelJob({ job: existingJob });
      }
    }

    const job = new PulseJobEntity();
    job.id = uuidv4();
    job.pulseConfigId = pulseConfigId;
    job.state = PulseJobState.CREATED;
    job.result = null;
    job.output = null;
    job.startedAt = null;
    job.finishedAt = null;

    const savedJob = await jobRepo.save(job);

    logger.info(`Created pulse job with ID ${savedJob.id}`);

    return savedJob.id;
  }

  /**
   * Runs a pulse job by ID
   * Executes the chatbot with the configured prompt and stores messages
   */
  async run(params: { id: string }): Promise<RunPulseJobResult> {
    const { id } = params;
    logger.info(`Running pulse job ${id} with max duration ${this.maxJobDurationMs}ms`);

    const jobRepo = this.dataSource.getRepository(PulseJobEntity);
    const configRepo = this.dataSource.getRepository(PulseConfigEntity);

    const job = await jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new Error(`Pulse job ${id} not found`);
    }

    // Verify job is not already finished
    if (job.state === PulseJobState.FINISHED) {
      throw new Error(`Pulse job ${id} is already finished with result: ${job.result}`);
    }

    // Get pulse config
    const config = await configRepo.findOne({ where: { id: job.pulseConfigId } });
    if (!config) {
      throw new Error(`Pulse config ${job.pulseConfigId} not found`);
    }

    // Update job state to running and set started time if not already set
    await this.updateJobState({ 
      job, 
      state: PulseJobState.RUNNING, 
      result: null,
      startedAt: job.startedAt || new Date()
    });

    const nextJobIds: string[] = [];

    try {
      // Create a project for the chatbot using the pulse config prompt
      const project = new Project();

      // Create chatbot instance
      const chatbot = await Chatbot.create(project);

      // Invoke chatbot with the configured prompt
      const stream = chatbot.stream({
        messages: [
          {
            role: "user",
            content: config.prompt
          }
        ]
      });

      // Convert stream to message using readUIMessageStream
      let assistantMessage = null;
      const messageStream = readUIMessageStream({ stream });
      for await (const message of messageStream) {
        assistantMessage = message;
      }
      
      if (!assistantMessage) {
        throw new Error("No message received from stream");
      }

      // Retrieve the report bundle from the project (stored by the agent)
      const reportBundleArtifact = project.get("report_bundle") as ReportBundle | null;
      const reportArtifact = project.get("report") as Report | null;
      
      // Extract summary from report bundle
      const reportText = reportBundleArtifact?.text || reportArtifact?.text || "";
      const summary = this.extractSummaryCodeBlock({ reportBundle: reportBundleArtifact });

      // Store the report bundle in database for viewing later
      let reportBundleId: string | null = null;
      if (reportBundleArtifact) {
        const reportStore = new ReportStore({ dataSource: this.dataSource });
        reportBundleId = await reportStore.create({
          bundle: {
            text: reportBundleArtifact.text,
            dataQueryResults: reportBundleArtifact.dataQueryResults
          }
        });
        logger.info(`Stored report bundle ${reportBundleId} for pulse job ${job.id}`);
        
        // Store the reportBundleId in the job entity
        job.reportBundleId = reportBundleId;
      }

      // Store output with messages and report summary
      const messages = [
        {
          role: "user",
          content: config.prompt
        },
        {
          role: "assistant",
          content: assistantMessage.parts
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map(part => part.text)
            .join(""),
          parts: assistantMessage.parts
        }
      ];

      job.output = {
        messages,
        report: reportText,
        reportSummary: summary,
        reportBundleId
      };

      // Save job after updating its output
      await jobRepo.save(job);

      // Get the current user's email
      const userEmail = await getCurrentUserEmail();

      // Send email if we have the user's email and a report (before marking job as finished)
      if (userEmail && summary) {
        const reportUrl = reportBundleId 
          ? `${this.baseUrl || "http://localhost:3000"}/report/${reportBundleId}`
          : null;

        await this.sendEmail({
          to: userEmail,
          subject: `${config.name} - ${new Date().toLocaleDateString()}`,
          htmlContent: await this.createEmailHTML({
            markdownContent: summary,
            reportUrl
          })
        });
      }

      // Update job state to finished with success result and finished time
      await this.updateJobState({ 
        job, 
        state: PulseJobState.FINISHED, 
        result: PulseJobResult.SUCCESS,
        finishedAt: new Date()
      });

      // Update pulse config last run time
      config.lastRunAt = new Date();
      await configRepo.save(config);

      logger.info(`Pulse job ${id} completed successfully`);

    } catch (error) {
      // Use the helper function to stop the job with error result
      const errorMessage = safeErrorString(error);
      await this.stopJob({
        job,
        result: PulseJobResult.ERROR,
        error: errorMessage
      });

      // Log error with full stack trace
      if (error instanceof Error && error.stack) {
        logger.error(`Pulse job ${id} failed: ${errorMessage}\nStack trace:\n${error.stack}`);
      } else {
        logger.error(`Pulse job ${id} failed: ${errorMessage}`);
      }
      // Return gracefully instead of throwing to prevent unhandled promise rejections
    }

    return { job, nextJobIds };
  }

  /**
   * Gets a pulse job by ID
   */
  async get(params: { id: string }): Promise<PulseJobEntity | null> {
    const { id } = params;
    return this.dataSource.getRepository(PulseJobEntity).findOne({ where: { id } });
  }

  /**
   * Gets all jobs for a pulse config
   */
  async getByConfig(params: { pulseConfigId: string }): Promise<PulseJobEntity[]> {
    const { pulseConfigId } = params;
    return this.dataSource.getRepository(PulseJobEntity).find({
      where: { pulseConfigId },
      order: { createdAt: "DESC" }
    });
  }

  /**
   * Cleans up stale pulse jobs by canceling jobs that have not been updated
   */
  async cleanup(): Promise<{ checkedCount: number; canceledCount: number }> {
    const STALE_JOB_THRESHOLD_MS = this.maxJobDurationMs * 2;

    logger.info(`Running pulse job cleanup with threshold of ${STALE_JOB_THRESHOLD_MS}ms`);

    const jobRepo = this.dataSource.getRepository(PulseJobEntity);

    // Find all unfinished jobs (created or running)
    const unfinishedJobs = await jobRepo.find({
      where: [
        { state: PulseJobState.CREATED },
        { state: PulseJobState.RUNNING }
      ]
    });

    logger.info(`Found ${unfinishedJobs.length} unfinished pulse job(s) to check`);

    let canceledCount = 0;
    const now = Date.now();

    for (const job of unfinishedJobs) {
      const timeSinceUpdate = now - job.updatedAt.getTime();

      if (timeSinceUpdate > STALE_JOB_THRESHOLD_MS) {
        logger.info(`Pulse job ${job.id} is stale (last updated ${timeSinceUpdate}ms ago), canceling`);

        await this.cancelJob({ job });
        canceledCount++;
      }
    }

    logger.info(`Pulse cleanup complete: checked ${unfinishedJobs.length} job(s), canceled ${canceledCount} stale job(s)`);

    return {
      checkedCount: unfinishedJobs.length,
      canceledCount
    };
  }

  /**
   * Sends an email with the report using Amazon SES
   */
  private async sendEmail(params: SendEmailParams): Promise<void> {
    const { to, subject, htmlContent } = params;

    // Validate required environment variables
    // TODO: Consider using IAM roles or AWS STS for temporary credentials instead of 
    // storing AWS credentials directly in environment variables for better security
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error("AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    }

    const config = getConfig();
    const senderEmail = config.email.sender;
    const senderName = config.email.senderName;

    if (!senderEmail) {
      throw new Error("Email sender not configured. Please set DATANAV_EMAIL_SENDER or config.email.sender");
    }

    // Format sender with name if provided: "Name <email@example.com>"
    const senderAddress = senderName 
      ? `${senderName} <${senderEmail}>`
      : senderEmail;

    const recipients = Array.isArray(to) ? to : [to];
    const recipientsStr = recipients.join(", ");
    
    logger.info(`Sending email via SES to ${recipientsStr} with subject: ${subject}`);

    // Create SES client
    const sesClient = new SESClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create the send email command
    const command = new SendEmailCommand({
      Source: senderAddress,
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: "UTF-8",
          },
        },
      },
      ...(process.env.SES_CONFIGURATION_SET && {
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
      }),
    });

    // Send the email
    const response = await sesClient.send(command);
    
    logger.info(`Email sent successfully to ${recipientsStr}. MessageId: ${response.MessageId}`);
  }

  /**
   * Extracts content from a ```summary...``` code block in the report bundle
   * Returns the content inside the code block, or empty string if not found
   */
  private extractSummaryCodeBlock(params: {
    reportBundle: ReportBundle | null;
  }): string {
    const { reportBundle } = params;
    
    if (!reportBundle?.text) return "";

    // Match ```summary...``` code block
    const summaryRegex = /```summary\s*\n([\s\S]*?)```/;
    const match = reportBundle.text.match(summaryRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }

    return "";
  }

  /**
   * Creates HTML email content with summary and link to full report
   * Converts markdown to HTML using remark
   */
  private async createEmailHTML(params: {
    markdownContent: string;
    reportUrl: string | null;
  }): Promise<string> {
    const { markdownContent, reportUrl } = params;
    
    // Convert markdown to HTML using remark
    const processedContent = await remark()
      .use(remarkGfm)
      .use(remarkHtml)
      .process(markdownContent);
    
    const contentHtml = processedContent.toString();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              border-bottom: 3px solid #228be6;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            .date {
              color: #868e96;
              font-size: 14px;
              margin: 0;
            }
            .summary {
              background: #f8f9fa;
              border-left: 4px solid #228be6;
              padding: 15px;
              margin: 20px 0;
            }
            .summary h2 {
              margin-top: 0;
              color: #495057;
              font-size: 20px;
            }
            .summary h3 {
              color: #495057;
              font-size: 18px;
            }
            .summary p {
              margin: 10px 0;
            }
            .summary ul, .summary ol {
              margin: 10px 0;
              padding-left: 25px;
            }
            .summary li {
              margin: 5px 0;
            }
            .summary table {
              border-collapse: collapse;
              width: 100%;
              margin: 15px 0;
            }
            .summary th, .summary td {
              border: 1px solid #dee2e6;
              padding: 8px 12px;
              text-align: left;
            }
            .summary th {
              background: #e9ecef;
              font-weight: 600;
            }
            .cta-button {
              display: inline-block;
              padding: 12px 24px;
              background: #228be6;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 500;
              margin: 20px 0;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #dee2e6;
              color: #868e96;
              font-size: 14px;
            }
            code {
              background: #e9ecef;
              padding: 2px 6px;
              border-radius: 3px;
              font-family: 'Monaco', 'Courier New', monospace;
              font-size: 0.9em;
            }
            pre {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 6px;
              overflow-x: auto;
            }
            pre code {
              background: none;
              padding: 0;
            }
            blockquote {
              border-left: 4px solid #dee2e6;
              margin: 15px 0;
              padding-left: 15px;
              color: #495057;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="date">${new Date().toLocaleDateString("en-US", { 
              weekday: "long", 
              year: "numeric", 
              month: "long", 
              day: "numeric" 
            })}</p>
          </div>
          
          <div class="summary">
            ${contentHtml}
          </div>
          
          ${reportUrl ? `
            <a href="${reportUrl}" class="cta-button">View Full Report</a>
          ` : ""}
          
          <div class="footer">
            <p>This is an automated pulse report from DataNav.</p>
          </div>
        </body>
      </html>
    `;
  }
}
