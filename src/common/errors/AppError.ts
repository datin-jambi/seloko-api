import { type FastifyReply } from "fastify";

// ─── HTTP Status Codes ────────────────────────────────────────────────────────
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

// ─── Base App Error ───────────────────────────────────────────────────────────
/**
 * Base error class for all application-level errors.
 * Subclass this to create domain-specific errors.
 */
export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatusCode,
    code: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

// ─── HTTP Error Subclasses ────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(message = "Bad Request", details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized — authentication required") {
    super(message, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden — insufficient permissions") {
    super(message, HttpStatus.FORBIDDEN, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", id?: string) {
    const message = id
      ? `${resource} with id "${id}" not found`
      : `${resource} not found`;
    super(message, HttpStatus.NOT_FOUND, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", details?: unknown) {
    super(message, HttpStatus.CONFLICT, "CONFLICT", details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests — slow down") {
    super(message, HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An unexpected internal error occurred") {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", undefined, false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service = "Service") {
    super(
      `${service} is temporarily unavailable`,
      HttpStatus.SERVICE_UNAVAILABLE,
      "SERVICE_UNAVAILABLE",
    );
  }
}

// ─── Error Response Shape ─────────────────────────────────────────────────────
export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path?: string;
}

/**
 * Serializes an AppError (or unknown thrown value) into the canonical
 * ErrorResponse shape and sends it to the Fastify reply.
 */
export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof AppError) {
    const body: ErrorResponse = {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
      ...(error.details !== undefined && { details: error.details }),
    };
    void reply.status(error.statusCode).send(body);
    return;
  }

  // Unknown error — do not leak internals
  console.error("[UnhandledError]", error);
  const body: ErrorResponse = {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
    timestamp: new Date().toISOString(),
  };
  void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
}
