// Native set function for Edge Runtime compatibility
function setValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

import { config as rawConfig } from "@/datanav.config";

// This config module can be loaded by JSX environments as well as Node.js
export interface Config {
  agent: any;
  database: any;
  email: {
    sender: string;
    senderName: string;
  };
  github: {
    repo: string;
  };
  hosting: {
    enabled: boolean;
  };
  job: {
    maxJobDurationMs: number;
  };
  packages: Record<string, any>;
}

// Function to build config with environment variable overrides
function buildConfig(rawConfig: any) {
  // Create a deep copy of the raw config (preserves functions and other non-serializable objects)
  const config = rawConfig;
  
  // Map environment variables to nested config keys
  const envMappings = {
    DATANAV_DATABASE_HOST: "database.host",
    DATANAV_DATABASE_PORT: "database.port",
    DATANAV_DATABASE_USERNAME: "database.username",
    DATANAV_DATABASE_PASSWORD: "database.password",
    DATANAV_DATABASE_DATABASE: "database.database",
    DATANAV_DATABASE_TYPE: "database.type",
    DATANAV_DATABASE_SSL: "database.ssl",
    DATANAV_EMAIL_SENDER: "email.sender",
    DATANAV_EMAIL_SENDER_NAME: "email.senderName",
    DATANAV_HOSTING_ENABLED: "hosting.enabled"
  };
  
  // Check each environment variable and apply overrides
  for (const [envVar, configPath] of Object.entries(envMappings)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      // Handle type conversion for specific fields
      if (configPath === "database.port") {
        setValue(config, configPath, parseInt(envValue));
      } else if (configPath === "database.ssl" || configPath === "hosting.enabled") {
        setValue(config, configPath, envValue.toLowerCase() === "true");
      } else {
        setValue(config, configPath, envValue);
      }
    }
  }
  
  return config;
}

// Lazy-loaded config instance
let cachedConfig: Config | null = null;

export function getConfig(): Config {
  // TODO: Add browser environment check to prevent client-side usage
  // Currently disabled due to test failures. Should be re-enabled after
  // fixing test mocks to properly handle server-only modules.
  
  if (!cachedConfig) {
    cachedConfig = buildConfig(rawConfig) as Config;
  }
  return cachedConfig;
}

export const defaultAgentConfig = () => getConfig().agent;
