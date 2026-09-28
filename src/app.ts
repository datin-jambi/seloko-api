import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyPlugin from "fastify-plugin";

import { env } from "./config/env.js";
import { appCodeMiddleware } from "./common/middlewares/index.js";
import { permissionGuard } from "./common/guards/index.js";
import { sendError, AppError, HttpStatus } from "./common/errors/index.js";

// ─── Application Factory ──────────────────────────────────────────────────────
export async function buildApp(): Promise<FastifyInstance> {
  // Built separately: with exactOptionalPropertyTypes, `transport: undefined`
  // is not assignable — the key must be absent in production.
  const loggerOptions =
    env.NODE_ENV === "production"
      ? { level: "info" }
      : {
          level: "debug",
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
        };

  const app = Fastify({
    logger: loggerOptions,
    // Expose request id in logs for tracing
    genReqId: (req) => {
      const existing = req.headers["x-request-id"];
      if (typeof existing === "string" && existing.length > 0) return existing;
      return crypto.randomUUID();
    },
    ajv: { customOptions: { strict: false } },
  }).withTypeProvider<ZodTypeProvider>();

  // ── Zod Type Provider ─────────────────────────────────────────────────────
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ── Security & Cookie ─────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-App-Code", "X-Request-Id"],
  });

  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    hook: "onRequest",
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "seloko_rt",
      signed: false,
    },
  });

  // ── Custom Plugins (order matters) ────────────────────────────────────────
  await app.register(appCodeMiddleware);
  await app.register(permissionGuard);

  // ── Global Error Handler ──────────────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Fastify validation errors (from Zod) have statusCode 400
    if (error.validation) {
      void reply.status(HttpStatus.BAD_REQUEST).send({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.validation,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // JWT errors
    if (error.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ||
        error.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED" ||
        error.code === "FST_JWT_AUTHORIZATION_TOKEN_INVALID") {
      void reply.status(HttpStatus.UNAUTHORIZED).send({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: "UNAUTHORIZED",
        message: "Invalid or expired access token",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Operational AppError subclasses
    if (error instanceof AppError) {
      sendError(reply, error);
      return;
    }

    // Non-operational / unknown error — log and hide internals
    request.log.error({ err: error }, "Unhandled internal error");
    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      timestamp: new Date().toISOString(),
    });
  });

  // ── Not Found Handler ─────────────────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    void reply.status(HttpStatus.NOT_FOUND).send({
      statusCode: HttpStatus.NOT_FOUND,
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Health Check (no X-App-Code required) ────────────────────────────────
  app.get("/health", {
    schema: {
      description: "Health check endpoint",
      tags: ["system"],
    },
  }, async (_request, reply) => {
    return reply.send({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    });
  });

  // ── Module Routes ─────────────────────────────────────────────────────────
  // Register with /api/v1 prefix — modules plug in here
  await app.register(
    async (api) => {
      // Core modules
      const { authRoutes } = await import("./modules/core/auth/auth.routes.js");
      await api.register(authRoutes, { prefix: "/auth" });
      // await api.register(usersRoutes, { prefix: "/users" });
      // await api.register(rbacRoutes, { prefix: "/rbac" });

      // Bapenda modules
      // await api.register(articlesRoutes, { prefix: "/articles" });
      // await api.register(bannersRoutes, { prefix: "/banners" });

      // Lapak modules
      // await api.register(merchantsRoutes, { prefix: "/merchants" });
      // await api.register(productsRoutes, { prefix: "/products" });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
