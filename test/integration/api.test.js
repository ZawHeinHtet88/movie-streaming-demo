import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../apps/server/src/app.js";

async function waitForStatus(app, id, expected) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request(app).get(`/api/status/${id}`);
    if (response.body.status === expected) return response;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${expected}`);
}

describe("video API", () => {
  let storageRoot;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hls-api-test-"));
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it("uploads an MP4, starts conversion, and serves generated HLS files", async () => {
    const converter = vi.fn(async ({ outputDirectory, onProgress }) => {
      onProgress(55);
      const renditionDirectory = path.join(outputDirectory, "720p");
      await fs.mkdir(renditionDirectory, { recursive: true });
      await fs.writeFile(
        path.join(outputDirectory, "index.m3u8"),
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\n720p/index.m3u8\n"
      );
      await fs.writeFile(
        path.join(renditionDirectory, "index.m3u8"),
        "#EXTM3U\n#EXTINF:6,\nsegment_000.ts\n"
      );
      await fs.writeFile(path.join(renditionDirectory, "segment_000.ts"), Buffer.from("segment"));
    });
    const app = createApp({ storageRoot, converter, maxFileSize: 1024 * 1024 });

    const upload = await request(app)
      .post("/api/upload")
      .attach("video", Buffer.from("fake mp4"), {
        filename: "sample.mp4",
        contentType: "video/mp4"
      });

    expect(upload.status).toBe(202);
    expect(upload.body).toMatchObject({ status: "converting" });
    expect(upload.body.id).toMatch(/^[0-9a-f-]{36}$/);

    const completed = await waitForStatus(app, upload.body.id, "completed");
    expect(completed.body.progress).toBe(100);
    expect(completed.body.playlistUrl).toBe(`/api/videos/${upload.body.id}/index.m3u8`);

    const playlist = await request(app).get(completed.body.playlistUrl);
    expect(playlist.status).toBe(200);
    expect(playlist.headers["content-type"]).toMatch(/application\/vnd\.apple\.mpegurl/);

    const rendition = await request(app).get(`/api/videos/${upload.body.id}/720p/index.m3u8`);
    expect(rendition.status).toBe(200);
    expect(rendition.headers["content-type"]).toMatch(/application\/vnd\.apple\.mpegurl/);

    const segment = await request(app).get(`/api/videos/${upload.body.id}/720p/segment_000.ts`);
    expect(segment.status).toBe(200);
    expect(segment.headers["content-type"]).toMatch(/video\/mp2t/);

    const uploadFiles = await fs.readdir(path.join(storageRoot, "uploads"));
    expect(uploadFiles).toHaveLength(0);
  });

  it("returns a useful failed status and removes temporary input", async () => {
    const app = createApp({
      storageRoot,
      converter: async () => {
        throw new Error("bad media stream");
      }
    });

    const upload = await request(app)
      .post("/api/upload")
      .attach("video", Buffer.from("broken"), {
        filename: "broken.mov",
        contentType: "video/quicktime"
      });
    const failed = await waitForStatus(app, upload.body.id, "failed");

    expect(failed.body.error).toBe("bad media stream");
    expect(await fs.readdir(path.join(storageRoot, "uploads"))).toHaveLength(0);
  });

  it("rejects unsupported files and missing uploads", async () => {
    const app = createApp({ storageRoot, converter: vi.fn() });

    const unsupported = await request(app)
      .post("/api/upload")
      .attach("video", Buffer.from("not a video"), {
        filename: "notes.txt",
        contentType: "text/plain"
      });
    const missing = await request(app).post("/api/upload");

    expect(unsupported.status).toBe(415);
    expect(missing.status).toBe(400);
  });

  it("returns 404 for unknown statuses and files and blocks unsafe paths", async () => {
    const app = createApp({ storageRoot, converter: vi.fn() });
    const id = "123e4567-e89b-42d3-a456-426614174000";

    expect((await request(app).get(`/api/status/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/videos/${id}/segment_999.ts`)).status).toBe(404);
    expect((await request(app).get("/api/status/not-a-uuid")).status).toBe(400);
  });
});
