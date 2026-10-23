import { describe, expect, it } from "vitest";
import {
  isSafeQuality,
  isSafeSegmentName,
  isSupportedVideo,
  isValidVideoId
} from "../../apps/server/src/video-validation.js";

describe("video validation", () => {
  it.each([
    ["movie.mp4", "video/mp4"],
    ["MOVIE.MP4", "video/mp4"],
    ["clip.mov", "video/quicktime"]
  ])("accepts %s with the expected MIME type", (name, mime) => {
    expect(isSupportedVideo({ originalname: name, mimetype: mime })).toBe(true);
  });

  it.each([
    ["payload.exe", "video/mp4"],
    ["movie.mp4", "application/octet-stream"],
    ["clip.mov", "video/mp4"],
    ["movie.mp4.exe", "video/mp4"]
  ])("rejects an unsafe name/type pair", (name, mime) => {
    expect(isSupportedVideo({ originalname: name, mimetype: mime })).toBe(false);
  });

  it("only accepts UUID video IDs", () => {
    expect(isValidVideoId("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isValidVideoId("../../uploads")).toBe(false);
  });

  it("only accepts generated transport-stream segment names", () => {
    expect(isSafeSegmentName("segment_000.ts")).toBe(true);
    expect(isSafeSegmentName("segment_1234.ts")).toBe(true);
    expect(isSafeSegmentName("../segment_000.ts")).toBe(false);
    expect(isSafeSegmentName("index.m3u8")).toBe(false);
  });

  it("only accepts configured adaptive quality directories", () => {
    expect(isSafeQuality("360p")).toBe(true);
    expect(isSafeQuality("480p")).toBe(true);
    expect(isSafeQuality("720p")).toBe(true);
    expect(isSafeQuality("1080p")).toBe(false);
    expect(isSafeQuality("../720p")).toBe(false);
  });
});
