import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  LoginBodySchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  LogoutResponseSchema,
  MeResponseSchema,
} from "./auth.schema.js";
import {
  handleLogin,
  handleRefresh,
  handleLogout,
  handleMe,
} from "./auth.controller.js";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /auth/login
  app.post("/login", {
    schema: {
      description: "Authenticate with email/username and password",
      tags: ["auth"],
      body: LoginBodySchema,
      response: { 200: LoginResponseSchema },
    },
  }, handleLogin);

  // POST /auth/refresh
  app.post("/refresh", {
    schema: {
      description: "Exchange HttpOnly refresh token cookie for a new access token",
      tags: ["auth"],
      response: { 200: RefreshResponseSchema },
    },
  }, handleRefresh);

  // POST /auth/logout
  app.post("/logout", {
    schema: {
      description: "Revoke refresh token and clear session",
      tags: ["auth"],
      response: { 200: LogoutResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleLogout);

  // GET /auth/me
  app.get("/me", {
    schema: {
      description: "Get authenticated user profile with active permissions",
      tags: ["auth"],
      response: { 200: MeResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleMe);
}
