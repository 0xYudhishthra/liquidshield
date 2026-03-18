// ============================================
// Authentication Middleware
// ============================================

import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import type { AppEnv } from "../index";
import { UnauthorizedError } from "./error-handler";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "development-secret-change-in-production",
);

export interface JwtPayload {
  sub: string; // User ID
  walletAddress: string;
  worldIdVerified?: boolean;
  iat: number;
  exp: number;
}

/**
 * Middleware that requires valid JWT authentication
 */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid authorization header");
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const jwtPayload = payload as unknown as JwtPayload;

    // Set user context
    c.set("walletAddress", jwtPayload.walletAddress);
    c.set("userId", jwtPayload.sub);

    await next();
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired token");
  }
};

/**
 * Optional auth middleware - sets user context if token is valid, but doesn't fail if missing
 */
export const optionalAuthMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next,
) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const jwtPayload = payload as unknown as JwtPayload;

      c.set("walletAddress", jwtPayload.walletAddress);
      c.set("userId", jwtPayload.sub);
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }

  await next();
};

/**
 * Validate Ethereum address format
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate strategy hash format (bytes32)
 */
export function isValidStrategyHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
