import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { HEADERS } from "~/common/constants/index.js";
import { BadRequestError } from "~/common/errors/index.js";

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
   * Hanya route di bawah /api yang dijaga. Membalik logika (jaga /api)
   * ketimbang mendaftar pengecualian mencegah endpoint publik baru —
   * health, metrics, docs — tanpa sengaja ikut terkunci.
   */
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      // request.url memuat query string, jadi cocokkan hanya bagian path.
      const path = request.url.split("?")[0] ?? "";
      if (!path.startsWith("/api/")) return;

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
