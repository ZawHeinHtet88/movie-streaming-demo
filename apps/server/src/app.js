import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { convertToHls } from "./hls-converter.js";
import { createStatusStore } from "./status-store.js";
import {
  isSafeQuality,
  isSafeSegmentName,
  isSupportedVideo,
  isValidVideoId
} from "./video-validation.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createApp({
  storageRoot = config.storageRoot,
  converter = convertToHls,
  maxFileSize = config.maxFileSize,
  clientOrigin = config.clientOrigin,
  statusStore = createStatusStore()
} = {}) {
  const app = express();
  const uploadsDirectory = path.join(storageRoot, "uploads");
  const videosDirectory = path.join(storageRoot, "videos");
  fs.mkdirSync(uploadsDirectory, { recursive: true });
  fs.mkdirSync(videosDirectory, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDirectory,
      filename: (_request, file, callback) => {
        callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      }
    }),
    limits: { fileSize: maxFileSize, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!isSupportedVideo(file)) {
        callback(httpError(415, "Only MP4 and MOV video files are supported"));
        return;
      }
      callback(null, true);
    }
  });

  app.disable("x-powered-by");
  app.use(cors({ origin: clientOrigin, methods: ["GET", "POST"] }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/upload", upload.single("video"), (request, response) => {
    if (!request.file) throw httpError(400, "A video file is required in the 'video' field");

    const id = crypto.randomUUID();
    const outputDirectory = path.join(videosDirectory, id);
    statusStore.create(id, { status: "uploading", progress: 100, error: null });
    statusStore.update(id, { status: "converting", progress: 0 });

    const runConversion = async () => {
      try {
        await converter({
          inputPath: request.file.path,
          outputDirectory,
          onProgress: (progress) => {
            statusStore.update(id, { status: "converting", progress });
          }
        });
        statusStore.update(id, {
          status: "completed",
          progress: 100,
          playlistUrl: `/api/videos/${id}/index.m3u8`
        });
      } catch (error) {
        await fsp.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
        statusStore.update(id, {
          status: "failed",
          progress: 0,
          error: (error.message || "Video conversion failed").slice(0, 2000)
        });
      } finally {
        await fsp.unlink(request.file.path).catch(() => {});
      }
    };

    void runConversion();
    response.status(202).json({ id, status: "converting", progress: 0 });
  });

  app.get("/api/status/:id", (request, response) => {
    if (!isValidVideoId(request.params.id)) {
      throw httpError(400, "Invalid video ID");
    }
    const status = statusStore.get(request.params.id);
    if (!status) throw httpError(404, "Video not found");
    response.json(status);
  });

  app.get("/api/videos/:id/index.m3u8", async (request, response) => {
    if (!isValidVideoId(request.params.id)) throw httpError(400, "Invalid video ID");
    const playlistPath = path.join(videosDirectory, request.params.id, "index.m3u8");
    try {
      await fsp.access(playlistPath);
    } catch {
      throw httpError(404, "Playlist not found");
    }
    response.type("application/vnd.apple.mpegurl");
    response.set("Cache-Control", "no-cache");
    response.sendFile(playlistPath);
  });

  app.get("/api/videos/:id/:quality/index.m3u8", async (request, response) => {
    if (!isValidVideoId(request.params.id)) throw httpError(400, "Invalid video ID");
    if (!isSafeQuality(request.params.quality)) throw httpError(400, "Invalid video quality");
    const playlistPath = path.join(
      videosDirectory,
      request.params.id,
      request.params.quality,
      "index.m3u8"
    );
    try {
      await fsp.access(playlistPath);
    } catch {
      throw httpError(404, "Rendition playlist not found");
    }
    response.type("application/vnd.apple.mpegurl");
    response.set("Cache-Control", "no-cache");
    response.sendFile(playlistPath);
  });

  app.get("/api/videos/:id/:quality/:segment", async (request, response) => {
    if (!isValidVideoId(request.params.id)) throw httpError(400, "Invalid video ID");
    if (!isSafeQuality(request.params.quality)) throw httpError(400, "Invalid video quality");
    if (!isSafeSegmentName(request.params.segment)) throw httpError(400, "Invalid segment name");
    const segmentPath = path.join(
      videosDirectory,
      request.params.id,
      request.params.quality,
      request.params.segment
    );
    try {
      await fsp.access(segmentPath);
    } catch {
      throw httpError(404, "Segment not found");
    }
    response.type("video/mp2t");
    response.set("Cache-Control", "public, max-age=31536000, immutable");
    response.sendFile(segmentPath);
  });

  app.get("/api/videos/:id/:segment", async (request, response) => {
    if (!isValidVideoId(request.params.id)) throw httpError(400, "Invalid video ID");
    if (!isSafeSegmentName(request.params.segment)) throw httpError(400, "Invalid segment name");
    const segmentPath = path.join(videosDirectory, request.params.id, request.params.segment);
    try {
      await fsp.access(segmentPath);
    } catch {
      throw httpError(404, "Segment not found");
    }
    response.type("video/mp2t");
    response.set("Cache-Control", "public, max-age=31536000, immutable");
    response.sendFile(segmentPath);
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? `Video exceeds the ${Math.round(maxFileSize / 1024 / 1024)} MB limit`
        : error.message;
      response.status(400).json({ error: message });
      return;
    }
    const status = Number.isInteger(error.status) ? error.status : 500;
    response.status(status).json({
      error: status === 500 ? "Internal server error" : error.message
    });
  });

  return app;
}
