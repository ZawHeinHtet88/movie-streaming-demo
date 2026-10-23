import path from "node:path";

const VIDEO_TYPES = new Map([
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"]
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEGMENT_PATTERN = /^segment_\d{3,}\.ts$/;
const QUALITY_PATTERN = /^(360p|480p|720p)$/;

export function isSupportedVideo(file) {
  if (!file?.originalname || !file?.mimetype) return false;
  const extension = path.extname(file.originalname).toLowerCase();
  return VIDEO_TYPES.get(extension) === file.mimetype.toLowerCase();
}

export function isValidVideoId(id) {
  return typeof id === "string" && UUID_PATTERN.test(id);
}

export function isSafeSegmentName(name) {
  return typeof name === "string" && SEGMENT_PATTERN.test(name);
}

export function isSafeQuality(quality) {
  return typeof quality === "string" && QUALITY_PATTERN.test(quality);
}
