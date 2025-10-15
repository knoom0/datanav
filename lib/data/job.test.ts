import { DataSource } from "typeorm";

import { DataConnectorStatusEntity, DataJobEntity } from "@/lib/data/entities";
import { DataJobScheduler, JobState, JobResult, JobType } from "@/lib/data/job";
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

  async updateStatus(params: { dataJobId?: string | null; isLoading?: boolean }): Promise<void> {
    // Mock implementation - just log for testing
    console.log("Mock updateStatus called with:", params);
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
      const job = await scheduler.get(jobId);
      expect(job).not.toBeNull();
      expect(job?.dataConnectorId).toBe("test.connector");
      expect(job?.type).toBe(JobType.LOAD);
      expect(job?.state).toBe(JobState.CREATED);
      expect(job?.result).toBeNull();
      expect(job?.runTimeMs).toBe(0);
      expect(job?.params).toEqual({});
      expect(job?.syncContext).toBeNull();
      expect(job?.progress).toBeNull();
      expect(job?.createdAt).toBeInstanceOf(Date);
      expect(job?.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a job with custom type and params", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector",
        type: "custom" as any, // Allow custom type for testing
        params: { foo: "bar", count: 42 }
      });

      const job = await scheduler.get(jobId);
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

      const jobs = await scheduler.getByConnector("test.connector");
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.id).sort()).toEqual([jobId1, jobId2].sort());
    });
  });

  describe("runJob", () => {
    it("should run a job and update its state to finished with success result", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const result = await scheduler.run(jobId);

      expect(result.job.id).toBe(jobId);
      expect(result.job.state).toBe(JobState.FINISHED);
      expect(result.job.result).toBe(JobResult.SUCCESS);
      expect(result.job.runTimeMs).toBeGreaterThan(0);
      expect(result.job.progress).toEqual({ updatedRecordCount: 100 });
      expect(result.nextJobIds).toEqual([]);

      // Verify the connector's load method was called
      const connector = mockConnectors.get("test.connector")!;
      expect((connector as any).loadCallCount).toBe(1);
    });

    it("should call progress callback during job execution", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const result = await scheduler.run(jobId);

      expect(result.job.id).toBe(jobId);
      expect(result.job.state).toBe(JobState.FINISHED);
      expect(result.job.result).toBe(JobResult.SUCCESS);

      // Verify the progress callback was called
      const connector = mockConnectors.get("test.connector")!;
      expect(connector.progressCallbacks).toEqual([100]);
    });

    it("should throw error for non-existent job", async () => {
      await expect(scheduler.run("00000000-0000-0000-0000-000000000000"))
        .rejects
        .toThrow("Job 00000000-0000-0000-0000-000000000000 not found");
    });

    it("should handle string job IDs", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Test with string job ID
      const result = await scheduler.run(jobId.toString());

      expect(result.job.id).toBe(jobId);
      expect(result.job.state).toBe(JobState.FINISHED);
      expect(result.job.result).toBe(JobResult.SUCCESS);
    });

    it("should throw error for invalid string job ID", async () => {
      await expect(scheduler.run("invalid"))
        .rejects
        .toThrow("Invalid job ID: invalid");
    });

    it("should throw error for non-existent connector", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "non.existent.connector"
      });

      await expect(scheduler.run(jobId))
        .rejects
        .toThrow("Connector non.existent.connector not found");

      // Verify job state was updated to finished with error result
      const job = await scheduler.get(jobId);
      expect(job?.state).toBe(JobState.FINISHED);
      expect(job?.result).toBe(JobResult.ERROR);
    });

    it("should pass maxDurationToRun to connector load method", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const maxDuration = 5000;
      await scheduler.run(jobId, maxDuration);

      // Verify the connector received the max duration parameter
      const connector = mockConnectors.get("test.connector")!;
      expect((connector as any).loadCallCount).toBe(1);
    });

    it("should return same job ID when maxDurationToRun is specified and sync context exists", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const maxDuration = 5000;
      const result = await scheduler.run(jobId, maxDuration);

      // Should return the same job ID to continue running
      expect(result.nextJobIds).toHaveLength(1);
      expect(result.nextJobIds[0]).toBe(jobId);

      // Verify the job is still in running state
      const job = await scheduler.get(jobId);
      expect(job?.state).toBe(JobState.RUNNING);
      expect(job?.result).toBeNull();
      expect(job?.runTimeMs).toBeGreaterThan(0);
      expect(job?.progress).toEqual({ updatedRecordCount: 100 });
    });

    it("should finish job when maxDurationToRun is not specified", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const result = await scheduler.run(jobId);

      // Should not continue running
      expect(result.nextJobIds).toEqual([]);
      expect(result.job.state).toBe(JobState.FINISHED);
      expect(result.job.result).toBe(JobResult.SUCCESS);
    });

    it("should update sync context and accumulate runTimeMs across multiple runs", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      const maxDuration = 5000;
      const result1 = await scheduler.run(jobId, maxDuration);

      // Verify sync context was updated and job is still running
      expect(result1.job.syncContext).toEqual({ pageToken: "page_1" });
      expect(result1.job.state).toBe(JobState.RUNNING);
      expect(result1.nextJobIds).toEqual([jobId]);
      expect(result1.job.progress).toEqual({ updatedRecordCount: 100 });
      const firstRunTime = result1.job.runTimeMs;
      expect(firstRunTime).toBeGreaterThanOrEqual(0);

      // Run the job again
      const result2 = await scheduler.run(jobId, maxDuration);
      
      // Verify runTimeMs accumulated (should be at least as much as first run, typically more)
      expect(result2.job.runTimeMs).toBeGreaterThanOrEqual(firstRunTime);
      expect(result2.job.syncContext).toEqual({ pageToken: "page_2" });
      expect(result2.job.state).toBe(JobState.RUNNING);
      expect(result2.job.progress).toEqual({ updatedRecordCount: 200 });
    });

    it("should handle failed job and update state", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector"
      });

      // Make the mock connector throw an error
      const connector = mockConnectors.get("test.connector")!;
      const originalLoad = connector.load.bind(connector);
      connector.load = async () => {
        throw new Error("Simulated load error");
      };

      await expect(scheduler.run(jobId))
        .rejects
        .toThrow("Simulated load error");

      // Verify job state was updated to finished with error result
      const job = await scheduler.get(jobId);
      expect(job?.state).toBe(JobState.FINISHED);
      expect(job?.result).toBe(JobResult.ERROR);
      expect(job?.runTimeMs).toBeGreaterThan(0);

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
        const job = await scheduler.get(jobId);
        jobStateWhileRunning = job?.state;
        return originalLoad(params);
      };

      await scheduler.run(jobId);

      expect(jobStateWhileRunning).toBe(JobState.RUNNING);

      // Restore original load method
      connector.load = originalLoad;
    });
  });

  describe("getJob", () => {
    it("should return null for non-existent job", async () => {
      const job = await scheduler.get("00000000-0000-0000-0000-000000000000");
      expect(job).toBeNull();
    });

    it("should return job by ID", async () => {
      const jobId = await scheduler.create({
        dataConnectorId: "test.connector",
        params: { test: "value" }
      });

      const job = await scheduler.get(jobId);
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

      const job = await scheduler.get(jobId.toString());
      expect(job).not.toBeNull();
      expect(job?.id).toBe(jobId);
      expect(job?.dataConnectorId).toBe("test.connector");
      expect(job?.params).toEqual({ test: "value" });
    });

    it("should throw error for invalid string job ID in get method", async () => {
      await expect(scheduler.get("invalid"))
        .rejects
        .toThrow("Invalid job ID: invalid");
    });
  });

  describe("getJobsByConnector", () => {
    it("should return empty array when no jobs exist", async () => {
      const jobs = await scheduler.getByConnector("test.connector");
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

      const jobs = await scheduler.getByConnector("test.connector");
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

      const jobs = await scheduler.getByConnector("test.connector");
      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe(jobId2); // Newest first
      expect(jobs[1].id).toBe(jobId1);
    });
  });
});

