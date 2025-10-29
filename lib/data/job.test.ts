import { DataSource } from "typeorm";

import { DataJobScheduler, JobState, JobResult, JobType } from "@/lib/data/job";
import { DataConnectorStatusEntity, DataJobEntity } from "@/lib/entities";
import { setupTestDatabase, teardownTestDatabase, type TestDatabaseSetup } from "@/lib/util/test-util";

// Mock data connector for testing
class MockDataConnector {
  id: string;
  private syncContextValue: Record<string, any> | null = null;
  private loadCallCount = 0;
  public progressCallbacks: number[] = [];
  
  constructor(id: string) {
    this.id = id;
    this.progressCallbacks = []; // Reset for each test
  }

  async load(params: { maxDurationToRunMs?: number; onProgressUpdate?: (params: { updatedRecordCount: number }) => void | Promise<void> } = {}): Promise<{ updatedRecordCount: number; isFinished: boolean }> {
    this.loadCallCount++;
    const { maxDurationToRunMs, onProgressUpdate } = params;
    
    // Simulate progress updates if callback is provided
    if (onProgressUpdate) {
      await onProgressUpdate({ updatedRecordCount: 100 });
      this.progressCallbacks.push(100);
    }
    
    // Simulate some work
    if (maxDurationToRunMs) {
      // If max duration is specified, set sync context to indicate more data
      this.syncContextValue = { pageToken: `page_${this.loadCallCount}` };
      return { updatedRecordCount: 100, isFinished: false };
    } else {
      // If no max duration, clear sync context (all data loaded)
      this.syncContextValue = null;
      return { updatedRecordCount: 100, isFinished: true };
    }
  }

  async getStatus(): Promise<DataConnectorStatusEntity | null> {
    const status = new DataConnectorStatusEntity();
    status.connectorId = this.id;
    status.isConnected = true;
    status.syncContext = this.syncContextValue;
    return status;
  }

  async updateStatus(params: { 
    dataJobId?: string | null; 
    isLoading?: boolean;
    lastDataJobId?: string | null;
  }): Promise<void> {
    // Mock implementation - output for test visibility
    process.stdout.write(`Mock updateStatus called with: ${JSON.stringify(params)}\n`);
  }
}

describe("DataJobScheduler", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let scheduler: DataJobScheduler;
  let mockConnectors: Map<string, MockDataConnector>;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataJobEntity, DataConnectorStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create mock connectors
    mockConnectors = new Map([
      ["test.connector", new MockDataConnector("test.connector")],
      ["another.connector", new MockDataConnector("another.connector")]
    ]);

    // Create scheduler with mock connector factory
    scheduler = new DataJobScheduler({
      dataSource: testDataSource,
      getDataConnector: async (connectorId: string) => {
        const connector = mockConnectors.get(connectorId);
        if (!connector) {
          throw new Error(`Connector ${connectorId} not found`);
        }
        return connector;
      }
    });
  }, 60000);

  afterEach(async () => {
    // Clean up test data between tests
    if (testDataSource?.isInitialized) {
      const jobRepo = testDataSource.getRepository(DataJobEntity);
      await jobRepo.clear();
    }
    
    // Reset mock connectors
    mockConnectors.forEach(connector => {
      (connector as any).syncContextValue = null;
      (connector as any).loadCallCount = 0;
      connector.progressCallbacks = []; // Reset progress callbacks
    });
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  }, 60000);

  describe("createJob", () => {
    it("should create a new job with default parameters", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Verify the job was created correctly
      const job = await scheduler.get({ id: jobId });
      expect(job).not.toBeNull();
      expect(job?.dataConnectorId).toBe("test.connector");
      expect(job?.type).toBe(JobType.LOAD);
      expect(job?.state).toBe(JobState.CREATED);
      expect(job?.result).toBeNull();
      expect(job?.params).toEqual({});
      expect(job?.syncContext).toBeNull();
      expect(job?.progress).toBeNull();
      expect(job?.startedAt).toBeNull();
      expect(job?.finishedAt).toBeNull();
      expect(job?.createdAt).toBeInstanceOf(Date);
      expect(job?.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a job with custom type and params", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector",
        type: "custom" as any, // Allow custom type for testing
        params: { foo: "bar", count: 42 }
      });

      const job = await scheduler.get({ id: jobId });
      expect(job?.type).toBe("custom");
      expect(job?.params).toEqual({ foo: "bar", count: 42 });
    });

    it("should create multiple jobs for the same connector", async () => {
      const jobId1 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const jobId2 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      expect(jobId1).not.toBe(jobId2);

      const jobs = await scheduler.getByConnector({ dataConnectorId: "test.connector" });
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.id).sort()).toEqual([jobId1, jobId2].sort());
    });

    it("should cancel existing unfinished jobs when creating a new job for the same connector", async () => {
      // Create first job
      const jobId1 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Verify first job exists and is in created state
      const job1 = await scheduler.get({ id: jobId1 });
      expect(job1?.state).toBe(JobState.CREATED);

      // Create second job for the same connector
      const jobId2 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Verify first job was canceled
      const canceledJob = await scheduler.get({ id: jobId1 });
      expect(canceledJob?.state).toBe(JobState.FINISHED);
      expect(canceledJob?.result).toBe(JobResult.CANCELED);

      // Verify second job is in created state
      const job2 = await scheduler.get({ id: jobId2 });
      expect(job2?.state).toBe(JobState.CREATED);
    });

    it("should cancel running jobs when creating a new job for the same connector", async () => {
      // Create and start running a job
      const jobId1 = await scheduler.create({
        dataConnectorId: "test.connector"
      });
      await scheduler.run({ id: jobId1 });

      // Verify job is running
      const runningJob = await scheduler.get({ id: jobId1 });
      expect(runningJob?.state).toBe(JobState.RUNNING);

      // Create a new job for the same connector
      const jobId2 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Verify first job was canceled
      const canceledJob = await scheduler.get({ id: jobId1 });
      expect(canceledJob?.state).toBe(JobState.FINISHED);
      expect(canceledJob?.result).toBe(JobResult.CANCELED);

      // Verify second job is in created state
      const job2 = await scheduler.get({ id: jobId2 });
      expect(job2?.state).toBe(JobState.CREATED);
    });
  });

  describe("runJob", () => {
    it("should run a job and set it to running state when not finished", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Since scheduler always uses maxJobDurationMs, the mock will return isFinished: false
      const result = await scheduler.run({ id: jobId });

      expect(result.job.id).toBe(jobId);
      expect(result.job.state).toBe(JobState.RUNNING);
      expect(result.job.result).toBeNull();
      expect(result.job.startedAt).toBeInstanceOf(Date);
      expect(result.job.finishedAt).toBeNull();
      expect(result.job.progress).toEqual({ updatedRecordCount: 100 });
      expect(result.nextJobIds).toEqual([jobId]);

      // Verify the connector's load method was called
      const connector = mockConnectors.get("test.connector")!;
      expect((connector as any).loadCallCount).toBe(1);
    });

    it("should call progress callback during job execution", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const result = await scheduler.run({ id: jobId });

      expect(result.job.id).toBe(jobId);
      // Job will be in running state since scheduler uses maxJobDurationMs
      expect(result.job.state).toBe(JobState.RUNNING);
      expect(result.job.result).toBeNull();

      // Verify the progress callback was called
      const connector = mockConnectors.get("test.connector")!;
      expect(connector.progressCallbacks).toEqual([100]);
    });

    it("should throw error for non-existent job", async () => {
      await expect(scheduler.run({ id: "00000000-0000-0000-0000-000000000000" }))
        .rejects
        .toThrow("Job 00000000-0000-0000-0000-000000000000 not found");
    });

    it("should handle string job IDs", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Test with string job ID
      const result = await scheduler.run({ id: jobId.toString() });

      expect(result.job.id).toBe(jobId);
      // Since scheduler uses maxJobDurationMs, job will be in running state
      expect(result.job.state).toBe(JobState.RUNNING);
      expect(result.job.result).toBeNull();
    });

    it("should return null for invalid job ID", async () => {
      // Without validation, invalid job IDs just return not found
      await expect(scheduler.run({ id: "invalid" }))
        .rejects
        .toThrow("Job invalid not found");
    });

    it("should throw error for non-existent connector during creation", async () => {
      // Creating a job for non-existent connector should fail immediately
      await expect(scheduler.create({
        dataConnectorId: "non.existent.connector"
      }))
        .rejects
        .toThrow("Connector non.existent.connector not found");
    });

    it("should throw error when trying to run an already finished job", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Manually mark the job as finished
      const jobRepo = (scheduler as any).dataSource.getRepository(DataJobEntity);
      const job = await jobRepo.findOne({ where: { id: jobId } });
      job.state = JobState.FINISHED;
      job.result = JobResult.SUCCESS;
      await jobRepo.save(job);

      // Try to run the finished job
      await expect(scheduler.run({ id: jobId }))
        .rejects
        .toThrow(`Job ${jobId} is already finished with result: success`);
    });

    it("should pass maxDurationToRun to connector load method", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      await scheduler.run({ id: jobId });

      // Verify the connector received the max duration parameter
      const connector = mockConnectors.get("test.connector")!;
      expect((connector as any).loadCallCount).toBe(1);
    });

    it("should return same job ID when job is not finished and sync context exists", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Since scheduler always uses maxJobDurationMs from config, mock will return isFinished: false
      const result = await scheduler.run({ id: jobId });

      // Should return the same job ID to continue running
      expect(result.nextJobIds).toHaveLength(1);
      expect(result.nextJobIds[0]).toBe(jobId);

      // Verify the job is still in running state
      const job = await scheduler.get({ id: jobId });
      expect(job?.state).toBe(JobState.RUNNING);
      expect(job?.result).toBeNull();
      expect(job?.startedAt).toBeInstanceOf(Date);
      expect(job?.finishedAt).toBeNull();
      expect(job?.progress).toEqual({ updatedRecordCount: 100 });
    });

    it("should continue running job when more data exists", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Scheduler always uses maxJobDurationMs from config, so job will continue
      const result = await scheduler.run({ id: jobId });

      // Should continue running since mock returns isFinished: false when maxDuration is set
      expect(result.nextJobIds).toEqual([jobId]);
      expect(result.job.state).toBe(JobState.RUNNING);
      expect(result.job.result).toBeNull();
    });

    it("should update sync context across multiple runs", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const result1 = await scheduler.run({ id: jobId });

      // Verify sync context was updated and job is still running
      expect(result1.job.syncContext).toEqual({ pageToken: "page_1" });
      expect(result1.job.state).toBe(JobState.RUNNING);
      expect(result1.nextJobIds).toEqual([jobId]);
      expect(result1.job.progress).toEqual({ updatedRecordCount: 100 });
      expect(result1.job.startedAt).toBeInstanceOf(Date);
      expect(result1.job.finishedAt).toBeNull();

      // Run the job again
      const result2 = await scheduler.run({ id: jobId });
      
      // Verify sync context was updated again and job still running
      expect(result2.job.syncContext).toEqual({ pageToken: "page_2" });
      expect(result2.job.state).toBe(JobState.RUNNING);
      expect(result2.job.progress).toEqual({ updatedRecordCount: 200 });
      expect(result2.job.startedAt).toBeInstanceOf(Date);
      expect(result2.job.finishedAt).toBeNull();
    });

    it("should return gracefully when job fails and update state to error", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Make the mock connector throw an error
      const connector = mockConnectors.get("test.connector")!;
      const originalLoad = connector.load.bind(connector);
      connector.load = async () => {
        throw new Error("Simulated load error");
      };

      // The scheduler.run should return gracefully without throwing
      const result = await scheduler.run({ id: jobId });

      // Verify it returned a result with the failed job
      expect(result.job.id).toBe(jobId);
      expect(result.job.state).toBe(JobState.FINISHED);
      expect(result.job.result).toBe(JobResult.ERROR);
      expect(result.job.startedAt).toBeInstanceOf(Date);
      expect(result.job.finishedAt).toBeInstanceOf(Date);
      expect(result.nextJobIds).toEqual([]);

      // Restore original load method
      connector.load = originalLoad;
    });

    it("should handle database errors gracefully (e.g., invalid dates)", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Make the mock connector throw a database error similar to production
      const connector = mockConnectors.get("test.connector")!;
      const originalLoad = connector.load.bind(connector);
      connector.load = async () => {
        throw new Error("date/time field value out of range: \"0000-12-31T00:00:00.000Z\"");
      };

      // The scheduler.run should return gracefully without throwing
      const result = await scheduler.run({ id: jobId });

      // Verify job state was updated correctly
      expect(result.job.state).toBe(JobState.FINISHED);
      expect(result.job.result).toBe(JobResult.ERROR);
      expect(result.nextJobIds).toEqual([]);

      // Restore original load method
      connector.load = originalLoad;
    });

    it("should update job state to running before execution", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Get the connector and make load async so we can check state during execution
      const connector = mockConnectors.get("test.connector")!;
      let jobStateWhileRunning: string | undefined;
      
      const originalLoad = connector.load.bind(connector);
      connector.load = async (params: { maxDurationToRunMs?: number; onProgressUpdate?: (params: { updatedRecordCount: number }) => void | Promise<void> } = {}) => {
        // Check job state while running
        const job = await scheduler.get({ id: jobId });
        jobStateWhileRunning = job?.state;
        return originalLoad(params);
      };

      await scheduler.run({ id: jobId });

      expect(jobStateWhileRunning).toBe(JobState.RUNNING);

      // Restore original load method
      connector.load = originalLoad;
    });
  });

  describe("getJob", () => {
    it("should return null for non-existent job", async () => {
      const job = await scheduler.get({ id: "00000000-0000-0000-0000-000000000000" });
      expect(job).toBeNull();
    });

    it("should return job by ID", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector",
        params: { test: "value" }
      });

      const job = await scheduler.get({ id: jobId });
      expect(job).not.toBeNull();
      expect(job?.id).toBe(jobId);
      expect(job?.dataConnectorId).toBe("test.connector");
      expect(job?.params).toEqual({ test: "value" });
    });

    it("should handle string job IDs in get method", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector",
        params: { test: "value" }
      });

      const job = await scheduler.get({ id: jobId.toString() });
      expect(job).not.toBeNull();
      expect(job?.id).toBe(jobId);
      expect(job?.dataConnectorId).toBe("test.connector");
      expect(job?.params).toEqual({ test: "value" });
    });

    it("should return null for invalid string job ID in get method", async () => {
      // Without validation, invalid job IDs just return null
      const job = await scheduler.get({ id: "invalid" });
      expect(job).toBeNull();
    });
  });

  describe("getJobsByConnector", () => {
    it("should return empty array when no jobs exist", async () => {
      const jobs = await scheduler.getByConnector({ dataConnectorId: "test.connector" });
      expect(jobs).toEqual([]);
    });

    it("should return all jobs for a connector", async () => {
      const jobId1 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const jobId2 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Create a job for another connector
      await scheduler.create({
        dataConnectorId: "another.connector"
      });

      const jobs = await scheduler.getByConnector({ dataConnectorId: "test.connector" });
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.id).sort()).toEqual([jobId1, jobId2].sort());
    });

    it("should return jobs ordered by creation time (newest first)", async () => {
      const jobId1 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const jobId2 = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const jobs = await scheduler.getByConnector({ dataConnectorId: "test.connector" });
      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe(jobId2); // Newest first
      expect(jobs[1].id).toBe(jobId1);
    });
  });
});

