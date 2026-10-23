import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(projectRoot, "apps", "server", ".env") });

export const config = {
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  maxFileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 500) * 1024 * 1024,
  storageRoot: path.resolve(process.env.STORAGE_ROOT || path.join(projectRoot, "storage"))
};
