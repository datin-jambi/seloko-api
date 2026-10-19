import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyMultipart from "@fastify/multipart";
import fastifyPlugin from "fastify-plugin";

import { env } from "~/config/env.js";
import { getRedisClient, pingRedis } from "~/config/redis.js";
import { pingDatabase } from "~/config/database.js";
import { isRabbitMQConnected } from "~/config/rabbitmq.js";
import { appCodeMiddleware } from "~/common/middlewares/index.js";
import { permissionGuard } from "~/common/guards/index.js";
import { RATE_LIMIT } from "~/common/constants/index.js";
import { sendError, AppError, HttpStatus, TooManyRequestsError } from "~/common/errors/index.js";

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

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 10,
    },
  });

  // ── Rate Limit ────────────────────────────────────────────────────────────
  // Global longgar; /auth/login mengetatkan sendiri lewat config per-route.
  // Memakai Redis agar batas berlaku lintas instance, bukan per proses.
  await app.register(fastifyRateLimit, {
    global: false,
    ...RATE_LIMIT.GLOBAL,
    redis: getRedisClient(),
    // Redis mati tidak boleh menjatuhkan request: tanpa ini ioredis melempar
    // MaxRetriesPerRequestError dan /login balas 500, sehingga login mustahil
    // justru saat infrastruktur sedang rapuh. Lebih baik batas tidak tegak
    // sementara daripada autentikasi mati total.
    skipOnError: true,
    // Kunci per-aplikasi: satu app yang dibanjiri tidak memblokir app lain
    // yang kebetulan berada di belakang IP publik yang sama.
    keyGenerator: (request) => `${request.ip}:${request.headers["x-app-code"] ?? "-"}`,
    // Wajib melempar TooManyRequestsError, bukan objek polos: error handler
    // global mencocokkan `instanceof AppError`, jadi objek biasa lolos ke
    // cabang "unknown error" dan klien menerima 500 alih-alih 429.
    errorResponseBuilder: (_request, context) =>
      new TooManyRequestsError(
        `Terlalu banyak percobaan. Coba lagi dalam ${context.after}.`,
      ),
  });

  // ── Custom Plugins (order matters) ────────────────────────────────────────
  await app.register(appCodeMiddleware);
  await app.register(permissionGuard);

  // ── Global Error Handler ──────────────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Fastify validation errors (from Zod) have statusCode 400
    if (error.validation) {
      // Transform array Zod errors → { field: "pesan pertama" }
      // instancePath: "/username" → field: "username"
      // Ambil hanya satu pesan per field (yang pertama muncul) agar respons ringkas.
      const fields: Record<string, string> = {};
      for (const issue of error.validation) {
        const raw = (issue as { instancePath?: string }).instancePath ?? "";
        // Hilangkan leading "/" dan ganti "/" berikutnya dengan "." (nested path)
        const field = raw.replace(/^\//, "").replace(/\//g, ".") || "_root";
        if (!(field in fields)) {
          fields[field] = (issue as { message?: string }).message ?? "Invalid value";
        }
      }
      void reply.status(HttpStatus.BAD_REQUEST).send({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: fields,
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

    // Multipart errors
    if (error.code === "FST_REQ_FILE_TOO_LARGE" ||
        error.code === "FST_FILES_LIMIT" ||
        error.code === "FST_PARTS_LIMIT" ||
        error.code === "FST_FIELDS_LIMIT") {
      void reply.status(HttpStatus.BAD_REQUEST).send({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "FILE_TOO_LARGE",
        message: error.message || "Ukuran berkas atau jumlah file melebihi batas maksimal",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Operational AppError subclasses
    if (error instanceof AppError) {
      sendError(reply, error);
      return;
    }

    // Non-operational / unknown error — log and hide internals (expose message in development)
    request.log.error({ err: error }, "Unhandled internal error");
    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: env.NODE_ENV === "development" ? (error.message || "An unexpected error occurred") : "An unexpected error occurred",
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
  // Liveness: proses hidup. Sengaja tidak menyentuh infrastruktur — orchestrator
  // tidak boleh me-restart API hanya karena Redis sedang down.
  app.get("/health", {
    schema: { description: "Liveness probe", tags: ["system"] },
  }, async (_request, reply) => {
    return reply.send({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    });
  });

  // Readiness: siap melayani trafik. Memeriksa ketiga infrastruktur.
  // PostgreSQL wajib; Redis dan RabbitMQ terdegradasi (permission jatuh ke DB,
  // audit event hilang) tapi API tetap melayani — jadi tidak menjatuhkan status.
  app.get("/health/ready", {
    schema: { description: "Readiness probe with dependency checks", tags: ["system"] },
  }, async (_request, reply) => {
    const [database, redis] = await Promise.all([pingDatabase(), pingRedis()]);
    const rabbitmq = isRabbitMQConnected();

    return reply.status(database ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).send({
      status: database ? "ok" : "unavailable",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      dependencies: { database, redis, rabbitmq },
    });
  });

  // ── Module Routes ─────────────────────────────────────────────────────────
  // Register with /api prefix — modules plug in here
  await app.register(
    async (api) => {
      // Core modules
      const { authRoutes } = await import("~/modules/core/auth/auth.routes.js");
      await api.register(authRoutes, { prefix: "/auth" });

      const { usersRoutes } = await import("~/modules/core/users/users.routes.js");
      await api.register(usersRoutes, { prefix: "/users" });

      const { applicationsRoutes } = await import(
        "~/modules/core/applications/applications.routes.js"
      );
      await api.register(applicationsRoutes, { prefix: "/applications" });

      const { rolesRoutes } = await import("~/modules/core/roles/roles.routes.js");
      await api.register(rolesRoutes, { prefix: "/roles" });

      const { permissionsRoutes } = await import(
        "~/modules/core/permissions/permissions.routes.js"
      );
      await api.register(permissionsRoutes, { prefix: "/permissions" });

      const { menusRoutes } = await import("~/modules/core/menus/menus.routes.js");
      await api.register(menusRoutes, { prefix: "/menus" });

      const { storageRoutes } = await import("~/modules/core/storage/storage.routes.js");
      await api.register(storageRoutes, { prefix: "/storage" });

      const { organizationsRoutes } = await import("~/modules/core/organizations/organizations.routes.js");
      await api.register(organizationsRoutes, { prefix: "/organizations" });

      // await api.register(rbacRoutes, { prefix: "/rbac" });

      // Bapenda modules
      const { uptdsRoutes } = await import("~/modules/bapenda/uptds/uptds.routes.js");
      await api.register(uptdsRoutes, { prefix: "/bapenda/uptds" });

      const { bannersRoutes } = await import("~/modules/bapenda/banners/banners.routes.js");
      await api.register(bannersRoutes, { prefix: "/bapenda/banners" });

      const { newsRoutes } = await import("~/modules/bapenda/news/news.routes.js");
      await api.register(newsRoutes, { prefix: "/bapenda/news" });

      const { pagesRoutes } = await import("~/modules/bapenda/pages/pages.routes.js");
      await api.register(pagesRoutes, { prefix: "/bapenda/pages" });

      // Lapak Jambi (Fase 1) — katalog aset daerah
      const { lapakCategoriesRoutes } = await import("~/modules/lapak/categories/categories.routes.js");
      await api.register(lapakCategoriesRoutes, { prefix: "/lapak/categories" });

      const { lapakProductsRoutes } = await import("~/modules/lapak/products/products.routes.js");
      await api.register(lapakProductsRoutes, { prefix: "/lapak/products" });

      const { lapakRatesRoutes } = await import("~/modules/lapak/rates/rates.routes.js");
      await api.register(lapakRatesRoutes, { prefix: "/lapak/rates" });

      // Katalog publik OPD — digabung dengan produk tanpa menyentuh core.
      const { lapakCatalogRoutes } = await import("~/modules/lapak/catalog/catalog.routes.js");
      await api.register(lapakCatalogRoutes, { prefix: "/lapak" });

      // Jam operasional & tanggal tutup produk (Fase 2).
      const { lapakAvailabilityRoutes } = await import("~/modules/lapak/availability/availability.routes.js");
      await api.register(lapakAvailabilityRoutes, { prefix: "/lapak/availability" });

      // Reservasi slot + anti double-booking (Fase 2).
      const { lapakReservationsRoutes } = await import("~/modules/lapak/reservations/reservations.routes.js");
      await api.register(lapakReservationsRoutes, { prefix: "/lapak/reservations" });

      // Keranjang warga — satu keranjang per OPD (Fase 2).
      const { lapakCartsRoutes } = await import("~/modules/lapak/carts/carts.routes.js");
      await api.register(lapakCartsRoutes, { prefix: "/lapak/carts" });

      // Quote & checkout → pesanan (Fase 2).
      const { lapakOrdersRoutes } = await import("~/modules/lapak/orders/orders.routes.js");
      await api.register(lapakOrdersRoutes, { prefix: "/lapak/orders" });

      // Pengaturan & penerbitan SKRD + penomoran gapless (Fase 2).
      const { lapakSkrdRoutes } = await import("~/modules/lapak/skrd/skrd.routes.js");
      await api.register(lapakSkrdRoutes, { prefix: "/lapak/skrd" });

      // Lapak modules
      // await api.register(merchantsRoutes, { prefix: "/merchants" });
      // await api.register(productsRoutes, { prefix: "/products" });
    },
    { prefix: "/api" },
  );

  return app;
}
