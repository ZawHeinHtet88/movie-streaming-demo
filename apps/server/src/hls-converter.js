import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const RENDITIONS = [
  {
    name: "360p",
    width: 640,
    height: 360,
    videoBitrate: "800k",
    maxRate: "856k",
    bufferSize: "1200k",
    audioBitrate: "96k",
    bandwidth: 1000000,
    averageBandwidth: 896000
  },
  {
    name: "480p",
    width: 854,
    height: 480,
    videoBitrate: "1400k",
    maxRate: "1498k",
    bufferSize: "2100k",
    audioBitrate: "128k",
    bandwidth: 1700000,
    averageBandwidth: 1528000
  },
  {
    name: "720p",
    width: 1280,
    height: 720,
    videoBitrate: "2800k",
    maxRate: "2996k",
    bufferSize: "4200k",
    audioBitrate: "128k",
    bandwidth: 3300000,
    averageBandwidth: 2928000
  }
];

function timestampToSeconds(timestamp) {
  const [hours, minutes, seconds] = timestamp.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function createMasterPlaylist() {
  const variants = RENDITIONS.map((rendition) => [
    `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},AVERAGE-BANDWIDTH=${rendition.averageBandwidth},RESOLUTION=${rendition.width}x${rendition.height}`,
    `${rendition.name}/index.m3u8`
  ].join("\n")).join("\n");

  return `#EXTM3U\n#EXT-X-VERSION:3\n${variants}\n`;
}

export function createHlsConverter({
  spawnImpl = spawn,
  mkdir = fs.mkdir,
  writeFile = fs.writeFile,
  ffmpegPath
} = {}) {
  function runFfmpeg(args, onProgress) {
    return new Promise((resolve, reject) => {
      const executable = ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";
      const child = spawnImpl(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"]
      });
      let duration = 0;
      let stderrTail = "";
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      child.stderr.on("data", (chunk) => {
        const output = chunk.toString();
        stderrTail = (stderrTail + output).slice(-2000);

        const durationMatch = output.match(/Duration:\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
        if (durationMatch) duration = timestampToSeconds(durationMatch[1]);

        const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
        if (duration > 0 && timeMatch) {
          const elapsed = timestampToSeconds(timeMatch[1]);
          onProgress(Math.min(99, Math.max(0, Math.round((elapsed / duration) * 100))));
        }
      });

      child.once("error", (error) => {
        fail(new Error(`Unable to start FFmpeg: ${error.message}`));
      });

      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve();
          return;
        }
        const detail = stderrTail.trim();
        reject(new Error(`FFmpeg exited with code ${code}${detail ? `: ${detail}` : ""}`));
      });
    });
  }

  return async function convertToHls({ inputPath, outputDirectory, onProgress = () => {} }) {
    await mkdir(outputDirectory, { recursive: true });

    for (const [index, rendition] of RENDITIONS.entries()) {
      const renditionDirectory = path.join(outputDirectory, rendition.name);
      const playlistPath = path.join(renditionDirectory, "index.m3u8");
      const segmentPattern = path.join(renditionDirectory, "segment_%03d.ts");
      await mkdir(renditionDirectory, { recursive: true });

      const videoFilter = [
        `scale=${rendition.width}:${rendition.height}:force_original_aspect_ratio=decrease`,
        `pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`
      ].join(",");
      const args = [
        "-hide_banner",
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        videoFilter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-profile:v",
        "main",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        rendition.videoBitrate,
        "-maxrate",
        rendition.maxRate,
        "-bufsize",
        rendition.bufferSize,
        "-force_key_frames",
        "expr:gte(t,n_forced*6)",
        "-c:a",
        "aac",
        "-b:a",
        rendition.audioBitrate,
        "-ac",
        "2",
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-hls_segment_filename",
        segmentPattern,
        playlistPath
      ];

      await runFfmpeg(args, (renditionProgress) => {
        const overallProgress = Math.round(((index * 100) + renditionProgress) / RENDITIONS.length);
        onProgress(Math.min(99, overallProgress));
      });
      onProgress(Math.min(99, Math.round(((index + 1) * 100) / RENDITIONS.length)));
    }

    const masterPlaylistPath = path.join(outputDirectory, "index.m3u8");
    await writeFile(masterPlaylistPath, createMasterPlaylist(), "utf8");
    return masterPlaylistPath;
  };
}

export const convertToHls = createHlsConverter();
