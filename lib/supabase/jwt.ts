import "server-only";
import crypto from "crypto";

// JWT token expiry time (1 hour)
const JWT_EXPIRY_SECONDS = 3600;

/**
 * Mint a JWT access token for a user
 * Uses the Supabase JWT secret to create a valid access token
 * 
 * NOTE: This file uses Node.js crypto and should only be imported
 * in server-side API routes, NOT in middleware (Edge Runtime)
 * 
 * @param userId - The user ID to create the token for
 * @returns A valid JWT access token
 * @throws Error if SUPABASE_JWT_SECRET is not set
 */
export function mintUserToken(userId: string): string {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("SUPABASE_JWT_SECRET environment variable is required");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + JWT_EXPIRY_SECONDS;

  // Create JWT header
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  // Create JWT payload
  const payload = {
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: expiry
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  // Create signature
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", jwtSecret)
    .update(signingInput)
    .digest("base64url");

  // Return complete JWT
  return `${signingInput}.${signature}`;
}

