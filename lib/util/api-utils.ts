import { AxiosError } from "axios";
import { NextResponse } from "next/server";

import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { safeErrorString } from "@/lib/util/log-util";

interface AxiosErrorResponse {
  error_message?: string;
  error?: {
    message?: string;
  };
  message?: string;
}

export function handleAPIError(error: unknown) {
  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error && "isAxiosError" in error) {
    const axiosError = error as AxiosError<AxiosErrorResponse>;
    console.error("Axios error:", {
      message: axiosError.message,
      response: axiosError.response?.data,
      status: axiosError.response?.status,
    });

    // Try to get the error message from different possible locations in the response
    const errorMessage = 
      axiosError.response?.data?.error_message || 
      axiosError.response?.data?.error?.message || 
      axiosError.response?.data?.message || 
      axiosError.message;

    return NextResponse.json(
      { error: errorMessage },
      { status: axiosError.response?.status || 500 }
    );
  }

  console.error("Unexpected error:", error);
  return NextResponse.json(
    { error: "An unexpected error occurred" },
    { status: 500 }
  );
}

type APIHandler = (...args: any[]) => Promise<NextResponse>;

export function withAPIErrorHandler(handler: APIHandler) {
  return async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error(`API handler error: ${safeErrorString(error)}`);
      return handleAPIError(error);
    }
  };
}

/**
 * Utility function to call internal APIs from within the application.
 * This is useful for making API calls from server-side code to other internal endpoints.
 * 
 * @param params - Configuration object
 * @param params.endpoint - The endpoint to call (e.g., "/api/data/load")
 * @param params.request - The original request object to get base URL and forward authentication cookies
 * @param params.method - HTTP method (defaults to "GET")
 * @param params.headers - Additional headers to include
 * @param params.body - Request body to send
 */
export async function callInternalAPI(params: {
  endpoint: string;
  request: Request;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const { endpoint, request, method = "GET", headers = {}, body } = params;
  
  try {
    // Get base URL from request
    const baseUrl = new URL(request.url).origin;
    const url = `${baseUrl}${endpoint}`;
    
    // Extract cookies and authorization header from the original request for authentication
    const cookieHeader = request.headers.get("cookie");
    const authHeader = request.headers.get("authorization");
    
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader && { "Cookie": cookieHeader }),
        ...(authHeader && { "Authorization": authHeader }),
        ...headers,
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      return {
        success: false,
        error: `Request failed with status ${response.status}: ${errorText}`,
      };
    }
    
    const data = await response.json().catch(() => null);
    
    return {
      success: true,
      data,
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
} 