// ============================================
// Global Error Handler
// ============================================

import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../index";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      404,
      "NOT_FOUND",
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(403, "FORBIDDEN", message);
  }
}

export class ChainNotSupportedError extends AppError {
  constructor(chainId: number) {
    super(400, "CHAIN_NOT_SUPPORTED", `Chain ${chainId} is not supported`);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(token: string, required: bigint, available: bigint) {
    super(400, "INSUFFICIENT_BALANCE", `Insufficient ${token} balance`, {
      required: required.toString(),
      available: available.toString(),
    });
  }
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  // Handle Hono HTTPException (e.g. basicAuth 401) — pass through as-is
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  console.error(`[Error] ${err.message}`, err.stack);

  // Handle known errors
  if (err instanceof AppError) {
    return c.json(
      {
        error: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
      err.statusCode as 400 | 401 | 403 | 404 | 500,
    );
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    return c.json(
      {
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: (err as any).errors,
      },
      400,
    );
  }

  // Handle unknown errors
  return c.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    },
    500,
  );
};
