import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      reporter: ["text", "html"],
      include: ["apps/server/src/**/*.js"],
      exclude: ["apps/server/src/server.js"]
    }
  }
});
