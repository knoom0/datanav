import { DataSource, In } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { PulseConfigEntity, PulseJobEntity } from "@/lib/entities";
import { calculateNextRunTime } from "@/lib/pulse/cron-utils";
import { PulseJobState } from "@/lib/pulse/job";

// Re-export for backwards compatibility
export { 
  calculateNextRunTime, 
  generateCronExpression, 
  parseCronExpression,
  type ScheduleFrequency,
  type ScheduleComponents
} from "@/lib/pulse/cron-utils";

export class PulseManager {
  private dataSource: DataSource;

  constructor(params: { dataSource: DataSource }) {
    this.dataSource = params.dataSource;
  }

  /**
   * Gets all pulse configs for the current user
   */
  async listConfigs(): Promise<PulseConfigEntity[]> {
    return this.dataSource.getRepository(PulseConfigEntity).find({
      order: { createdAt: "DESC" }
    });
  }

  /**
   * Gets a single pulse config by ID
   */
  async getConfig(params: { id: string }): Promise<PulseConfigEntity | null> {
    const { id } = params;
    return this.dataSource.getRepository(PulseConfigEntity).findOne({ where: { id } });
  }

  /**
   * Creates a new pulse config
   */
  async createConfig(params: {
    name: string;
    description: string;
    prompt: string;
    cron: string;
    cronTimezone?: string;
    enabled?: boolean;
  }): Promise<PulseConfigEntity> {
    const {
      name,
      description,
      prompt,
      cron,
      cronTimezone = null,
      enabled = true
    } = params;

    // Calculate the next run time based on the cron expression
    const nextRunAt = calculateNextRunTime({
      cron,
      cronTimezone,
      fromDate: new Date()
    });

    const pulseConfig = new PulseConfigEntity();
    pulseConfig.id = uuidv4();
    pulseConfig.name = name;
    pulseConfig.description = description;
    pulseConfig.prompt = prompt;
    pulseConfig.cron = cron;
    pulseConfig.cronTimezone = cronTimezone;
    pulseConfig.enabled = enabled;
    pulseConfig.lastRunAt = null;
    pulseConfig.nextRunAt = nextRunAt;

    return this.dataSource.getRepository(PulseConfigEntity).save(pulseConfig);
  }

  /**
   * Updates a pulse config
   */
  async updateConfig(params: {
    id: string;
    name?: string;
    description?: string;
    prompt?: string;
    cron?: string;
    cronTimezone?: string | null;
    enabled?: boolean;
  }): Promise<PulseConfigEntity> {
    const { id, ...updates } = params;

    const repo = this.dataSource.getRepository(PulseConfigEntity);
    const config = await repo.findOne({ where: { id } });

    if (!config) {
      throw new Error(`Pulse config ${id} not found`);
    }

    // If cron properties changed, recalculate nextRunAt
    if (updates.cron !== undefined || updates.cronTimezone !== undefined) {
      const newCron = updates.cron ?? config.cron;
      const newCronTimezone = updates.cronTimezone !== undefined 
        ? updates.cronTimezone 
        : config.cronTimezone;
      
      const nextRunAt = calculateNextRunTime({
        cron: newCron,
        cronTimezone: newCronTimezone,
        fromDate: new Date()
      });
      
      Object.assign(updates, { nextRunAt });
    }

    // Apply updates
    Object.assign(config, updates);

    return repo.save(config);
  }

  /**
   * Updates the next run time for a pulse config based on its cron expression
   */
  async updateNextRunTime(params: { id: string }): Promise<PulseConfigEntity> {
    const { id } = params;

    const repo = this.dataSource.getRepository(PulseConfigEntity);
    const config = await repo.findOne({ where: { id } });

    if (!config) {
      throw new Error(`Pulse config ${id} not found`);
    }

    // Calculate the next run time based on the cron expression
    const nextRunAt = calculateNextRunTime({
      cron: config.cron,
      cronTimezone: config.cronTimezone,
      fromDate: new Date()
    });

    config.nextRunAt = nextRunAt;

    return repo.save(config);
  }

  /**
   * Deletes a pulse config and cancels any running jobs
   */
  async deleteConfig(params: { id: string }): Promise<void> {
    const { id } = params;

    const repo = this.dataSource.getRepository(PulseConfigEntity);
    const config = await repo.findOne({ where: { id } });

    if (!config) {
      throw new Error(`Pulse config ${id} not found`);
    }

    // Cancel any running jobs for this config
    const jobRepo = this.dataSource.getRepository(PulseJobEntity);
    const unfinishedJobs = await jobRepo.find({
      where: {
        pulseConfigId: id,
        state: In([PulseJobState.CREATED, PulseJobState.RUNNING])
      }
    });

    // Mark jobs as canceled
    for (const job of unfinishedJobs) {
      job.state = PulseJobState.FINISHED;
      job.result = "canceled";
      job.finishedAt = new Date();
      await jobRepo.save(job);
    }

    await repo.remove(config);
  }
}
