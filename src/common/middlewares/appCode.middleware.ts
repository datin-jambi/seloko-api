import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { HEADERS } from "../constants/index.js";
import { BadRequestError } from "../errors/index.js";

// ─── Validation ───────────────────────────────────────────────────────────────
// App code: huruf kecil, angka, underscore ATAU tanda hubung, 2–50 karakter.
// Tanda hubung wajib didukung — kode aplikasi terdaftar memakainya
// (mis. "lapak-jambi-web", "bapenda-profile").
const APP_CODE_PATTERN = /^[a-z0-9_-]{2,50}$/;

async function appCodeMiddlewarePlugin(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
): Promise<void> {
  /**
   * Global onRequest hook: extracts and validates the X-App-Code header.
   * Populates request.appCode for downstream handlers and guards.
   *
   * Skips validation for the health-check endpoint so uptime monitors
   * can function without setting the header.
   */
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      // Allow health check without the header
      if (request.url === "/health" || request.url === "/health/") return;

      const rawCode = request.headers[HEADERS.APP_CODE];

      if (!rawCode) {
        throw new BadRequestError(
          `Missing required header: "${HEADERS.APP_CODE}"`,
        );
      }

      const appCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;

      if (!appCode || !APP_CODE_PATTERN.test(appCode)) {
        throw new BadRequestError(
          `Invalid "${HEADERS.APP_CODE}" header value. ` +
            `Must match pattern: ${APP_CODE_PATTERN.source}`,
        );
      }

      // Assign to augmented request object
      request.appCode = appCode;
    },
  );
}

export const appCodeMiddleware = fp(appCodeMiddlewarePlugin, {
  name: "app-code-middleware",
});
