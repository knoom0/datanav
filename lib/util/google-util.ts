import * as crypto from "crypto";

import logger from "@/lib/logger";

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Creates a JWT token for Google service account authentication
 * For domain-wide delegation, pass the user email to impersonate
 */
function createJWT(credentials: ServiceAccountCredentials, scopes: string[], userEmail?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: credentials.private_key_id
  };

  const payload: any = {
    iss: credentials.client_email,
    scope: scopes.join(" "),
    aud: credentials.token_uri,
    exp: expiry,
    iat: now
  };

  // Add user impersonation if provided (for domain-wide delegation)
  if (userEmail) {
    payload.sub = userEmail;
  }

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  // Clean up the private key - handle various formatting issues
  let privateKey = credentials.private_key;
  
  // Replace escaped newlines with actual newlines
  privateKey = privateKey.replace(/\\n/g, "\n");
  
  // Ensure proper formatting around the key headers
  privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----\s*/, "-----BEGIN PRIVATE KEY-----\n");
  privateKey = privateKey.replace(/\s*-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----");
  
  // Remove any extra whitespace or newlines that might cause issues
  privateKey = privateKey.replace(/\n+/g, "\n");
  
  // Ensure it starts and ends properly
  if (!privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n")) {
    privateKey = "-----BEGIN PRIVATE KEY-----\n" + privateKey.replace(/^-----BEGIN PRIVATE KEY-----/, "");
  }
  if (!privateKey.endsWith("\n-----END PRIVATE KEY-----")) {
    privateKey = privateKey.replace(/-----END PRIVATE KEY-----$/, "") + "\n-----END PRIVATE KEY-----";
  }

  try {
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(signingInput)
      .sign(privateKey, "base64url");
    
    return `${signingInput}.${signature}`;
  } catch (error) {
    logger.error(`Failed to sign JWT with private key: ${(error as Error).message}. Key starts with: ${privateKey.substring(0, 50)}`);
    throw new Error(`Failed to sign JWT: ${(error as Error).message}. Check that your GOOGLE_SERVICE_ACCOUNT_JSON contains a valid private key.`);
  }
}

/**
 * Gets an access token using Google service account credentials
 * For domain-wide delegation, pass the user email to impersonate
 */
export async function getServiceAccountAccessToken(
  credentials: ServiceAccountCredentials,
  scopes: string[],
  userEmail?: string
): Promise<string> {
  const jwt = createJWT(credentials, scopes, userEmail);
  
  const tokenRequest = {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  };

  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(tokenRequest)
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(`Service account token request failed: ${response.status} ${error}`);
    throw new Error(`Failed to get service account access token: ${response.status} ${error}`);
  }

  const tokenData: AccessTokenResponse = await response.json();
  logger.info(`Successfully obtained service account access token${userEmail ? ` for user ${userEmail}` : ""}`);
  
  return tokenData.access_token;
}

/**
 * Gets service account credentials from GOOGLE_SERVICE_ACCOUNT_JSON environment variable
 * Throws an error if the environment variable is not set or invalid
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set. Please provide the complete service account JSON as an environment variable.");
  }

  try {
    return JSON.parse(serviceAccountJson) as ServiceAccountCredentials;
  } catch {
    throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON. Please ensure it contains valid JSON.");
  }
}

/**
 * Gets a service account access token for testing purposes
 * This will try both with and without domain-wide delegation
 */
export async function getServiceAccountAccessTokenForTesting(
  credentials: ServiceAccountCredentials,
  scopes: string[]
): Promise<string> {
  // First try without domain-wide delegation (for service account"s own resources)
  try {
    logger.info("Attempting to get service account token without delegation");
    return await getServiceAccountAccessToken(credentials, scopes);
  } catch (error) {
    logger.warn(`Service account token without delegation failed: ${(error as Error).message}`);
    
    // If there's a test user email available, try with delegation
    const testUserEmail = process.env.GOOGLE_TEST_USER_EMAIL;
    if (testUserEmail) {
      logger.info(`Attempting to get service account token with delegation for user: ${testUserEmail}`);
      try {
        return await getServiceAccountAccessToken(credentials, scopes, testUserEmail);
      } catch (delegationError) {
        logger.error(`Service account token with delegation failed: ${(delegationError as Error).message}`);
        throw new Error(`Failed to get service account token. Tried both direct access and delegation. Original error: ${(error as Error).message}. Delegation error: ${(delegationError as Error).message}`);
      }
    } else {
      logger.error("No GOOGLE_TEST_USER_EMAIL provided for delegation fallback");
      throw error;
    }
  }
}
