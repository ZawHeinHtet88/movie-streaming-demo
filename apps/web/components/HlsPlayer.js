"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export default function HlsPlayer({ source }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState("-1");
  const [nativePlayback, setNativePlayback] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return undefined;

    setLoading(true);
    setError("");
    setLevels([]);
    setSelectedLevel("-1");
    setNativePlayback(false);
    let hls;

    const ready = () => setLoading(false);
    const playbackError = () => {
      setLoading(false);
      setError("The browser could not play this video.");
    };
    video.addEventListener("loadedmetadata", ready);
    video.addEventListener("error", playbackError);

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, startLevel: -1 });
      hlsRef.current = hls;
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels.map((level, index) => ({
          index,
          height: level.height,
          bitrate: level.bitrate
        })));
        ready();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        setLoading(false);
        setError("HLS playback stopped because of an unrecoverable error.");
        hls.destroy();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      setNativePlayback(true);
      video.src = source;
    } else {
      setLoading(false);
      setError("HLS playback is not supported in this browser.");
    }

    return () => {
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("error", playbackError);
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [source]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} controls playsInline className="h-full w-full" />
      {!loading && !error && (levels.length > 0 || nativePlayback) && (
        <div className="absolute right-3 top-3 z-10 rounded-lg border border-white/15 bg-slate-950/80 px-2 py-1 shadow-lg backdrop-blur-md">
          {nativePlayback ? (
            <span className="text-xs font-medium text-slate-200">Auto quality</span>
          ) : (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <span>Quality</span>
              <select
                aria-label="Video quality"
                value={selectedLevel}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedLevel(value);
                  if (hlsRef.current) hlsRef.current.currentLevel = Number(value);
                }}
                className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white outline-none focus:border-cyan-300/60"
              >
                <option value="-1">Auto</option>
                {levels.map((level) => (
                  <option key={level.index} value={String(level.index)}>
                    {level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm text-slate-300">
          <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-300" />
          Loading stream…
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-6 text-center text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
