import { DataSource, type DataSourceOptions } from "typeorm";

import { getConfig } from "@/lib/config";
import { UserDatabaseConfig, getHostingDataSource } from "@/lib/hosting/entities";
import logger from "@/lib/logger";


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
 * Setup a new database for a user and save the configuration
 */
export async function setupUserDatabase(userId: string): Promise<UserDatabaseConfig> {
  const databaseName = `datanav_user_${userId}`;
  
  logger.info(`Starting database setup for user ${userId}`);
  
  const hostingDataSource = await getHostingDataSource();
  const userConfigRepo = hostingDataSource.getRepository(UserDatabaseConfig);
  
  // Check if user config already exists
  logger.debug(`Checking for existing database configuration for user ${userId}`);
  const existingConfig = await userConfigRepo.findOne({
    where: { userId }
  });
  
  if (existingConfig) {
    logger.warn(`Database configuration already exists for user ${userId} with database: ${existingConfig.databaseName}`);
    throw new Error(`Database configuration already exists for user: ${userId}`);
  }
  
  // Get the main database connection to create the new database
  logger.debug("Retrieving database configuration for admin connection");
  const config = getConfig();
  const adminDataSource = new DataSource({
    ...config.database,
    // Connect to the default postgres database to create new databases
    database: "postgres",
  });
  
  try {
    logger.debug("Initializing admin database connection");
    await adminDataSource.initialize();
    logger.debug("Admin database connection initialized successfully");
    
    // Create the user-specific database
    logger.info(`Creating database: ${databaseName}`);
    await adminDataSource.query(`CREATE DATABASE "${databaseName}"`);
    logger.info(`Successfully created database: ${databaseName}`);
    
    // Save the database configuration
    logger.debug(`Creating user database configuration record for user ${userId}`);
    const userConfig = userConfigRepo.create({
      userId,
      databaseName,
      isExternal: false,
      externalConnectionString: null,
    });
    
    const savedConfig = await userConfigRepo.save(userConfig);
    logger.info(`Successfully saved database configuration for user ${userId}`);
    
    logger.info(`Database setup completed successfully for user ${userId}`);
    
    return savedConfig;
    
  } catch (error) {
    logger.error(`Failed to setup database for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    if (adminDataSource.isInitialized) {
      logger.debug("Closing admin database connection");
      await adminDataSource.destroy();
      logger.debug("Admin database connection closed");
    }
  }
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
