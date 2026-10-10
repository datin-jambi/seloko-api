import assert from "node:assert/strict";
import { ImageKitService } from "./imagekit.service.js";

// ─── Test 1: buildFolderPath ──────────────────────────────────────────────────
assert.equal(
  ImageKitService.buildFolderPath("bapenda-profile", "articles"),
  "/bapenda-profile/articles",
  "Path folder harus memuat /appCode/module",
);

assert.equal(
  ImageKitService.buildFolderPath("Bapenda Profile", "Articles", "Thumbnails"),
  "/bapenda-profile/articles/thumbnails",
  "Path folder harus disanitasi ke lowercase dan slug",
);

assert.equal(
  ImageKitService.buildFolderPath("seloko", "users", "avatars"),
  "/seloko/users/avatars",
  "Subfolder avatars harus tersusun rapi",
);

console.info("imagekit.check: OK");
