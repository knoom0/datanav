import { DataSource, In } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { getConfig } from "@/lib/config";
import { DataConnector } from "@/lib/data/connector";
import { DataJobEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import { safeErrorString } from "@/lib/util/log-util";

export const JobState = {
  CREATED: "created",
  RUNNING: "running", 
  FINISHED: "finished"
} as const;

export const JobResult = {
  SUCCESS: "success",
  ERROR: "error",
  CANCELED: "canceled"
} as const;

export const JobType = {
  LOAD: "load"
} as const;

export type JobStateType = typeof JobState[keyof typeof JobState];
export type JobResultType = typeof JobResult[keyof typeof JobResult];
export type JobTypeType = typeof JobType[keyof typeof JobType];

export interface CreateJobParams {
  dataConnectorId: string;
  type?: JobTypeType;
  params?: Record<string, any>;
}

export interface RunJobResult {
  job: DataJobEntity;
  nextJobIds: string[];
}

export class DataJobScheduler {
  private dataSource: DataSource;
  private getDataConnector: (connectorId: string) => Promise<any>;
  private maxJobDurationMs: number;

  constructor(params: { 
    dataSource: DataSource;
    getDataConnector: (connectorId: string) => Promise<any>;
  }) {
    this.dataSource = params.dataSource;
    this.getDataConnector = params.getDataConnector;
    
    // Get max duration from config
    const config = getConfig();
    this.maxJobDurationMs = config.job.maxJobDurationMs;
  }

  /**
   * Updates job state and result, then saves it
   */
  private async updateJobState(params: {
    job: DataJobEntity;
    state: JobStateType;
    result: JobResultType | null;
  }): Promise<void> {
    const { job, state, result } = params;
    job.state = state;
    job.result = result;
    await this.dataSource.getRepository(DataJobEntity).save(job);
  }

  /**
   * Stops a job by updating its state and clearing the connector status
   * Can be used for error, canceled, or other terminal states
   * @param params.job - Job to stop
   * @param params.result - The result type (error, canceled, etc.)
   * @param params.error - Optional error message for failed jobs
   */
  private async stopJob(params: {
    job: DataJobEntity;
    result: JobResultType;
    error?: string;
  }): Promise<void> {
    const { job, result, error } = params;
    logger.info(`Stopping job ${job.id} with result: ${result}`);
    
    // Set finished time
    job.finishedAt = new Date();
    
    // Set error message if provided
    if (error) {
      job.error = error;
    }
    
    // Update job state to finished with the specified result
    await this.updateJobState({ job, state: JobState.FINISHED, result });
    
    // Clear dataJobId, set isLoading to false, and save lastDataJobId on the connector
    const connector = await this.getDataConnector(job.dataConnectorId);
    await connector.updateStatus({ 
      dataJobId: null, 
      isLoading: false,
      lastDataJobId: job.id
    });
    
    logger.info(`Job ${job.id} stopped with result: ${result}`);
  }

  /**
   * Cancels a job by marking it as canceled and clearing the connector status
   * @param params.job - Job to cancel
   */
  private async cancelJob(params: { job: DataJobEntity }): Promise<void> {
    await this.stopJob({ job: params.job, result: JobResult.CANCELED });
  }

  /**
   * Creates a new data job
   * @param params - Job creation parameters
   * @returns ID of the newly created job
   */
  async create(params: CreateJobParams): Promise<string> {
    const { dataConnectorId, type = JobType.LOAD, params: jobParams = {} } = params;
    
    logger.info(`Creating new job for connector ${dataConnectorId} with type ${type}`);
    
    const jobRepo = this.dataSource.getRepository(DataJobEntity);
    
    // Cancel any existing unfinished jobs for this connector
    const unfinishedJobs = await jobRepo.find({
      where: {
        dataConnectorId,
        state: In([JobState.CREATED, JobState.RUNNING])
      }
    });
    
    if (unfinishedJobs.length > 0) {
      logger.info(`Canceling ${unfinishedJobs.length} existing unfinished job(s) for connector ${dataConnectorId}`);
      for (const existingJob of unfinishedJobs) {
        await this.cancelJob({ job: existingJob });
      }
    }
    
    const job = new DataJobEntity();
    job.id = uuidv4();
    job.dataConnectorId = dataConnectorId;
    job.type = type;
    job.state = JobState.CREATED;
    job.result = null;
    job.params = jobParams;
    job.syncContext = null;
    job.progress = null;
    job.startedAt = null;
    job.finishedAt = null;
    
    const savedJob = await jobRepo.save(job);
    
    // Update connector status with the job ID and set loading state
    const connector = await this.getDataConnector(dataConnectorId);
    await connector.updateStatus({ dataJobId: savedJob.id, isLoading: true });
    
    logger.info(`Created job with ID ${savedJob.id}`);
    
    return savedJob.id;
  }

  /**
   * Runs a data job by ID
   * @param params.id - Job ID to run (string)
   * @returns Updated job entity and list of job IDs to run next
   */
  async run(params: { id: string }): Promise<RunJobResult> {
    const { id } = params;
    logger.info(`Running job ${id} with max duration ${this.maxJobDurationMs}ms`);
    
    const jobRepo = this.dataSource.getRepository(DataJobEntity);
    const job = await jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }
    
    // Verify job is not already finished
    if (job.state === JobState.FINISHED) {
      throw new Error(`Job ${id} is already finished with result: ${job.result}`);
    }
    
    // Set started time if not already set
    if (!job.startedAt) {
      job.startedAt = new Date();
    }
    
    // Update job state to running
    job.state = JobState.RUNNING;
    await jobRepo.save(job);
    
    const nextJobIds: string[] = [];
    
    try {
      const connector = await this.getDataConnector(job.dataConnectorId);
      if (!connector) {
        throw new Error(`Data connector ${job.dataConnectorId} not found`);
      }
      
      if (job.type === JobType.LOAD) {
        const { isFinished } = await this.executeLoadJob({
          job,
          connector,
          maxDurationToRun: this.maxJobDurationMs
        });
        
        if (isFinished) {
          // Set finished time
          job.finishedAt = new Date();
          
          // Update job state to finished with success result
          await this.updateJobState({ job, state: JobState.FINISHED, result: JobResult.SUCCESS });
          
          // Clear dataJobId, set isLoading to false, and save lastDataJobId when job is finished
          await connector.updateStatus({ 
            dataJobId: null, 
            isLoading: false,
            lastDataJobId: job.id
          });
          
          logger.info(`Job ${id} completed successfully`);
        } else {
          // Job not finished yet, save current state and continue
          await jobRepo.save(job);
          nextJobIds.push(id);
          logger.info(`Job ${id} reached time limit, will continue running`);
        }
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }
      
    } catch (error) {
      // Use the helper function to stop the job with error result and clear connector status
      const errorMessage = safeErrorString(error);
      await this.stopJob({ 
        job, 
        result: JobResult.ERROR,
        error: errorMessage
      });
      
      // Log error with full stack trace
      if (error instanceof Error && error.stack) {
        logger.error(`Job ${id} failed: ${errorMessage}\nStack trace:\n${error.stack}`);
      } else {
        logger.error(`Job ${id} failed: ${errorMessage}`);
      }
      // Return gracefully instead of throwing to prevent unhandled promise rejections
      // in after() blocks or background jobs
    }
    
    return { job, nextJobIds };
  }

  /**
   * Updates job progress in the database
   */
  private async updateJobProgress(params: {
    job: DataJobEntity;
    updatedRecordCount: number;
  }): Promise<void> {
    const { job, updatedRecordCount } = params;
    const currentProgress = job.progress || { updatedRecordCount: 0 };
    currentProgress.updatedRecordCount = updatedRecordCount;
    job.progress = currentProgress;
    
    const jobRepo = this.dataSource.getRepository(DataJobEntity);
    await jobRepo.save(job);
  }

  /**
   * Executes a load job and returns completion status
   */
  private async executeLoadJob(params: {
    job: DataJobEntity;
    connector: DataConnector;
    maxDurationToRun: number;
  }): Promise<{ isFinished: boolean }> {
    const { job, connector, maxDurationToRun } = params;
    logger.info(`Loading data for connector ${job.dataConnectorId}`);
    
    // Create progress callback that updates the job progress in the database
    const onProgressUpdate = async (params: { updatedRecordCount: number }) => {
      // For progress updates, we want to accumulate the progress across multiple runs
      const currentProgress = job.progress || { updatedRecordCount: 0 };
      const newTotal = currentProgress.updatedRecordCount + params.updatedRecordCount;
      await this.updateJobProgress({ job, updatedRecordCount: newTotal });
    };
    
    const loadResult = await connector.load({ 
      maxDurationToRunMs: maxDurationToRun,
      onProgressUpdate 
    });
    logger.info(`Loaded ${loadResult.updatedRecordCount} records for connector ${job.dataConnectorId}`);
    
    // Progress is already updated via the callback, no need to accumulate again
    
    // Get the updated sync context from the connector status
    const connectorStatus = await connector.getStatus();
    job.syncContext = connectorStatus?.syncContext || null;
    
    return { isFinished: loadResult.isFinished };
  }

  /**
   * Gets a job by ID
   * @param params.id - Job ID (string)
   * @returns Job entity or null if not found
   */
  async get(params: { id: string }): Promise<DataJobEntity | null> {
    const { id } = params;
    return this.dataSource.getRepository(DataJobEntity).findOne({ where: { id } });
  }

  /**
   * Gets all jobs for a data connector
   * @param params.dataConnectorId - Data connector ID
   * @returns Array of job entities
   */
  async getByConnector(params: { dataConnectorId: string }): Promise<DataJobEntity[]> {
    const { dataConnectorId } = params;
    return this.dataSource.getRepository(DataJobEntity).find({ 
      where: { dataConnectorId },
      order: { createdAt: "DESC" }
    });
  }

  /**
   * Cleans up stale jobs by canceling jobs that have not been updated for maxJobDurationMs * 2
   * Uses maxJobDurationMs from config
   * @returns Object containing counts of checked and canceled jobs
   */
  async cleanup(): Promise<{ checkedCount: number; canceledCount: number }> {
    const STALE_JOB_THRESHOLD_MS = this.maxJobDurationMs * 2;
    
    logger.info(`Running job cleanup with threshold of ${STALE_JOB_THRESHOLD_MS}ms`);
    
    const jobRepo = this.dataSource.getRepository(DataJobEntity);
    
    // Find all unfinished jobs (created or running)
    const unfinishedJobs = await jobRepo.find({
      where: [
        { state: JobState.CREATED },
        { state: JobState.RUNNING }
      ]
    });
    
    logger.info(`Found ${unfinishedJobs.length} unfinished job(s) to check`);
    
    let canceledCount = 0;
    const now = Date.now();
    
    for (const job of unfinishedJobs) {
      const timeSinceUpdate = now - job.updatedAt.getTime();
      
      if (timeSinceUpdate > STALE_JOB_THRESHOLD_MS) {
        logger.info(`Job ${job.id} is stale (last updated ${timeSinceUpdate}ms ago), canceling`);
        
        // Use the cancelJob helper to cancel the job and update connector status
        await this.cancelJob({ job });
        canceledCount++;
      }
    }
    
    logger.info(`Cleanup complete: checked ${unfinishedJobs.length} job(s), canceled ${canceledCount} stale job(s)`);
    
    return {
      checkedCount: unfinishedJobs.length,
      canceledCount
    };
  }
}