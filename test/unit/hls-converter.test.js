import { EventEmitter } from "node:events";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHlsConverter } from "../../apps/server/src/hls-converter.js";

function fakeProcess(exitCode, stderrLines = []) {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    stderrLines.forEach((line) => child.stderr.emit("data", Buffer.from(line)));
    child.emit("close", exitCode);
  });
  return child;
}

describe("HLS converter", () => {
  it("spawns FFmpeg without a shell and with safe HLS arguments", async () => {
    const spawnImpl = vi.fn(() => fakeProcess(0));
    const mkdir = vi.fn(async () => {});
    const writeFile = vi.fn(async () => {});
    const converter = createHlsConverter({ spawnImpl, mkdir, writeFile });
    const outputDirectory = path.join("storage", "videos", "safe-id");

    await converter({
      inputPath: path.join("storage", "uploads", "source.mp4"),
      outputDirectory
    });

    expect(spawnImpl).toHaveBeenCalledTimes(3);
    const expectedRenditions = [
      ["360p", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2"],
      ["480p", "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2"],
      ["720p", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"]
    ];

    expectedRenditions.forEach(([name, filter], index) => {
      const [command, args, options] = spawnImpl.mock.calls[index];
      expect(command).toBe("ffmpeg");
      expect(options).toMatchObject({ shell: false, windowsHide: true });
      expect(args).toContain(filter);
      expect(args).toContain("6");
      expect(args).toContain("-force_key_frames");
      expect(args).toContain("expr:gte(t,n_forced*6)");
      expect(args).toContain(path.join(outputDirectory, name, "index.m3u8"));
      expect(args).toContain(path.join(outputDirectory, name, "segment_%03d.ts"));
    });

    expect(writeFile).toHaveBeenCalledWith(
      path.join(outputDirectory, "index.m3u8"),
      expect.stringContaining("360p/index.m3u8"),
      "utf8"
    );
    expect(writeFile.mock.calls[0][1]).toContain("480p/index.m3u8");
    expect(writeFile.mock.calls[0][1]).toContain("720p/index.m3u8");
  });

  it("reports parsed FFmpeg progress", async () => {
    const onProgress = vi.fn();
    const spawnImpl = vi.fn(() =>
      fakeProcess(0, [
        "Duration: 00:01:40.00, start: 0.000000, bitrate: 1000 kb/s\n",
        "frame=100 time=00:00:25.00 bitrate=1000kbits/s\n"
      ])
    );
    const converter = createHlsConverter({
      spawnImpl,
      mkdir: async () => {},
      writeFile: async () => {}
    });

    await converter({ inputPath: "input.mp4", outputDirectory: "output", onProgress });

    expect(onProgress).toHaveBeenCalledWith(8);
    expect(onProgress).toHaveBeenCalledWith(42);
    expect(onProgress).toHaveBeenCalledWith(75);
  });

  it("resolves FFMPEG_PATH when conversion starts", async () => {
    const spawnImpl = vi.fn(() => fakeProcess(0));
    const converter = createHlsConverter({
      spawnImpl,
      mkdir: async () => {},
      writeFile: async () => {}
    });
    const previousPath = process.env.FFMPEG_PATH;
    process.env.FFMPEG_PATH = "C:\\tools\\ffmpeg.exe";

    try {
      await converter({ inputPath: "input.mp4", outputDirectory: "output" });
      expect(spawnImpl.mock.calls[0][0]).toBe("C:\\tools\\ffmpeg.exe");
    } finally {
      if (previousPath === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previousPath;
    }
  });

  it("rejects when FFmpeg cannot start or exits unsuccessfully", async () => {
    const converter = createHlsConverter({
      spawnImpl: () => fakeProcess(1, ["conversion failed"]),
      mkdir: async () => {},
      writeFile: async () => {}
    });

    await expect(
      converter({ inputPath: "input.mp4", outputDirectory: "output" })
    ).rejects.toThrow("FFmpeg exited with code 1");
  });
});
