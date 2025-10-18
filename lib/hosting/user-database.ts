import { DataSource, type DataSourceOptions } from "typeorm";

import { getConfig } from "@/lib/config";
import { UserDatabaseConfig, getHostingDataSource } from "@/lib/hosting/entities";
import logger from "@/lib/logger";

// PostgreSQL's default administrative database used for maintenance operations like creating new databases
const POSTGRES_ADMIN_DATABASE = "postgres";

/**
 * Get user database configuration
 */
export async function getUserDatabaseConfig(userId: string): Promise<UserDatabaseConfig | null> {
  const hostingDataSource = await getHostingDataSource();
  const userConfigRepo = hostingDataSource.getRepository(UserDatabaseConfig);
  
  return await userConfigRepo.findOne({
    where: { userId }
  });
}


/**
 * Create a database if it doesn't exist
 * Handles race conditions by catching "duplicate database" errors
 */
async function createDatabaseIfNotExist(databaseName: string): Promise<void> {
  const config = getConfig();
  const adminDataSource = new DataSource({
    ...config.database,
    database: POSTGRES_ADMIN_DATABASE,
  });
  
  try {
    await adminDataSource.initialize();
    
    // Try to create the database directly
    // PostgreSQL doesn't have CREATE DATABASE IF NOT EXISTS, so we catch the error
    logger.info(`Creating database: ${databaseName}`);
    await adminDataSource.query(`CREATE DATABASE "${databaseName}"`);
    logger.info(`Successfully created database: ${databaseName}`);
  } catch (error) {
    // Check if error is "database already exists" (PostgreSQL error code 42P04)
    if (error instanceof Error && (error as any).code === "42P04") {
      logger.debug(`Database ${databaseName} already exists, skipping creation`);
    } else {
      // Re-throw other errors
      throw error;
    }
  } finally {
    if (adminDataSource.isInitialized) {
      await adminDataSource.destroy();
    }
  }
}

/**
 * Setup a new database for a user and save the configuration
 */
export async function setupUserDatabase(userId: string): Promise<UserDatabaseConfig> {
  const databaseName = `datanav_user_${userId}`;
  
  logger.info(`Starting database setup for user ${userId}`);
  
  const hostingDataSource = await getHostingDataSource();
  const userConfigRepo = hostingDataSource.getRepository(UserDatabaseConfig);
  
  // Check if user config already exists
  const existingConfig = await userConfigRepo.findOne({
    where: { userId }
  });
  
  if (existingConfig) {
    logger.warn(`Database configuration already exists for user ${userId}`);
    throw new Error(`Database configuration already exists for user: ${userId}`);
  }
  
  // Create the database if it doesn't exist
  await createDatabaseIfNotExist(databaseName);
  
  // Save the database configuration
  const userConfig = userConfigRepo.create({
    userId,
    databaseName,
    isExternal: false,
    externalConnectionString: null,
  });
  
  const savedConfig = await userConfigRepo.save(userConfig);
  logger.info(`Database setup completed successfully for user ${userId}`);
  
  return savedConfig;
}

/**
 * Get DataSource options for a user, creating the database setup if it doesn't exist
 */
export async function getUserDataSourceOptions(userId: string): Promise<DataSourceOptions> {
  let userConfig = await getUserDatabaseConfig(userId);
  
  // If no config exists, set up the database first
  if (!userConfig) {
    logger.info(`No database configuration found for user ${userId}, setting up new database`);
    userConfig = await setupUserDatabase(userId);
  }
  
  // Ensure the database exists (handles recovery from missing databases)
  if (!userConfig.isExternal) {
    await createDatabaseIfNotExist(userConfig.databaseName);
  }
  
  const config = getConfig();
  
  // Create data source options based on user config
  if (userConfig.isExternal && userConfig.externalConnectionString) {
    // Parse external connection string and create data source options
    const url = new URL(userConfig.externalConnectionString);
    return {
      type: "postgres",
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading '/'
    };
  } else {
    // Use shared database infrastructure with user-specific database name
    return {
      ...config.database,
      database: userConfig.databaseName,
    };
  }
}
