import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { DataConnector } from "@/lib/data/connector";
import { DataJobEntity } from "@/lib/data/entities";
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

  constructor(params: { 
    dataSource: DataSource;
    getDataConnector: (connectorId: string) => Promise<any>;
  }) {
    this.dataSource = params.dataSource;
    this.getDataConnector = params.getDataConnector;
  }

  /**
   * Validates job ID format (should be a valid UUID)
   */
  private validateJobId(id: string): void {
    if (!id || typeof id !== "string") {
      throw new Error(`Invalid job ID: ${id}`);
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error(`Invalid job ID: ${id}`);
    }
  }

  /**
   * Updates job with run time and saves it
   */
  private async updateJobWithRunTime(job: DataJobEntity, startTime: number): Promise<void> {
    job.runTimeMs += Date.now() - startTime;
    await this.dataSource.getRepository(DataJobEntity).save(job);
  }

  /**
   * Updates job state and result, then saves it
   */
  private async updateJobState(job: DataJobEntity, state: JobStateType, result: JobResultType | null, startTime: number): Promise<void> {
    job.state = state;
    job.result = result;
    await this.updateJobWithRunTime(job, startTime);
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
    
    const job = new DataJobEntity();
    job.id = uuidv4();
    job.dataConnectorId = dataConnectorId;
    job.type = type;
    job.state = JobState.CREATED;
    job.result = null;
    job.runTimeMs = 0;
    job.params = jobParams;
    job.syncContext = null;
    job.progress = null;
    
    const savedJob = await jobRepo.save(job);
    
    // Update connector status with the job ID and set loading state
    try {
      const connector = await this.getDataConnector(dataConnectorId);
      if (connector) {
        await connector.updateStatus({ dataJobId: savedJob.id, isLoading: true });
      }
    } catch (error) {
      logger.error(`Failed to update connector status with job ID: ${safeErrorString(error)}`);
      // Don't throw here - the job was created successfully, status update is secondary
    }
    
    logger.info(`Created job with ID ${savedJob.id}`);
    
    return savedJob.id;
  }

  /**
   * Runs a data job by ID
   * @param id - Job ID to run (string)
   * @param maxDurationToRun - Maximum duration in milliseconds for the job to run
   * @returns Updated job entity and list of job IDs to run next
   */
  async run(id: string, maxDurationToRun?: number): Promise<RunJobResult> {
    logger.info(`Running job ${id}${maxDurationToRun ? ` with max duration ${maxDurationToRun}ms` : ""}`);
    
    this.validateJobId(id);
    
    const jobRepo = this.dataSource.getRepository(DataJobEntity);
    const job = await jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }
    
    const startTime = Date.now();
    
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
        const { isFinished } = await this.executeLoadJob(job, connector, maxDurationToRun);
        
        if (isFinished) {
          await this.updateJobState(job, JobState.FINISHED, JobResult.SUCCESS, startTime);
          
          // Clear dataJobId and set isLoading to false when job is finished
          await connector.updateStatus({ dataJobId: null, isLoading: false });
          
          logger.info(`Job ${id} completed successfully`);
        } else {
          await this.updateJobWithRunTime(job, startTime);
          nextJobIds.push(id);
          logger.info(`Job ${id} reached time limit, will continue running`);
        }
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }
      
    } catch (error) {
      await this.updateJobState(job, JobState.FINISHED, JobResult.ERROR, startTime);
      
      // Clear dataJobId and set isLoading to false when job fails
      try {
        const connector = await this.getDataConnector(job.dataConnectorId);
        if (connector) {
          await connector.updateStatus({ dataJobId: null, isLoading: false });
        }
      } catch (connectorError) {
        logger.error(`Failed to update connector status after job failure: ${safeErrorString(connectorError)}`);
      }
      
      logger.error(`Job ${id} failed: ${safeErrorString(error)}`);
      throw error;
    }
    
    return { job, nextJobIds };
  }

  /**
   * Updates job progress in the database
   */
  private async updateJobProgress(job: DataJobEntity, updatedRecordCount: number): Promise<void> {
    const currentProgress = job.progress || { updatedRecordCount: 0 };
    currentProgress.updatedRecordCount = updatedRecordCount;
    job.progress = currentProgress;
    
    const jobRepo = this.dataSource.getRepository(DataJobEntity);
    await jobRepo.save(job);
  }

  /**
   * Executes a load job and returns completion status
   */
  private async executeLoadJob(
    job: DataJobEntity, 
    connector: DataConnector, 
    maxDurationToRun?: number
  ): Promise<{ isFinished: boolean }> {
    logger.info(`Loading data for connector ${job.dataConnectorId}`);
    
    // Create progress callback that updates the job progress in the database
    const onProgressUpdate = async (params: { updatedRecordCount: number }) => {
      // For progress updates, we want to accumulate the progress across multiple runs
      const currentProgress = job.progress || { updatedRecordCount: 0 };
      const newTotal = currentProgress.updatedRecordCount + params.updatedRecordCount;
      await this.updateJobProgress(job, newTotal);
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
   * @param id - Job ID (string)
   * @returns Job entity or null if not found
   */
  async get(id: string): Promise<DataJobEntity | null> {
    this.validateJobId(id);
    return this.dataSource.getRepository(DataJobEntity).findOne({ where: { id } });
  }

  /**
   * Gets all jobs for a data connector
   * @param dataConnectorId - Data connector ID
   * @returns Array of job entities
   */
  async getByConnector(dataConnectorId: string): Promise<DataJobEntity[]> {
    return this.dataSource.getRepository(DataJobEntity).find({ 
      where: { dataConnectorId },
      order: { createdAt: "DESC" }
    });
  }
}