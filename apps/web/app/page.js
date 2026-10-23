"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HlsPlayer from "../components/HlsPlayer";
import UploadZone from "../components/UploadZone";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export default function Home() {
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState(null);
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const [error, setError] = useState("");
  const requestRef = useRef(null);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPhase("idle");
    setProgress(0);
    setVideoId(null);
    setPlaylistUrl(null);
    setError("");
  }, []);

  const uploadVideo = useCallback((file) => {
    setError("");
    setPhase("uploading");
    setProgress(0);

    const formData = new FormData();
    formData.append("video", file);
    const request = new XMLHttpRequest();
    requestRef.current = request;

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      requestRef.current = null;
      let body = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = {};
      }

      if (request.status < 200 || request.status >= 300) {
        setError(body.error || "The upload failed. Please try again.");
        setPhase("failed");
        return;
      }

      setVideoId(body.id);
      setPhase("converting");
      setProgress(0);
    });

    request.addEventListener("error", () => {
      requestRef.current = null;
      setError("Could not reach the video server.");
      setPhase("failed");
    });

    request.addEventListener("abort", () => {
      requestRef.current = null;
    });

    request.open("POST", `${API_URL}/api/upload`);
    request.send(formData);
  }, []);

  useEffect(() => {
    if (phase !== "converting" || !videoId) return undefined;

    let cancelled = false;
    let timer;

    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/status/${videoId}`, {
          cache: "no-store"
        });
        if (!response.ok) throw new Error("Could not read conversion status");
        const result = await response.json();
        if (cancelled) return;

        setProgress(result.progress ?? 0);
        if (result.status === "completed") {
          setPlaylistUrl(`${API_URL}${result.playlistUrl}`);
          setPhase("completed");
          return;
        }
        if (result.status === "failed") {
          setError(result.error || "Video conversion failed.");
          setPhase("failed");
          return;
        }
        timer = window.setTimeout(checkStatus, 1000);
      } catch (statusError) {
        if (cancelled) return;
        setError(statusError.message || "Could not read conversion status.");
        setPhase("failed");
      }
    };

    checkStatus();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, videoId]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const isWorking = phase === "uploading" || phase === "converting";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="relative z-10 w-full max-w-4xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
            Local HLS Studio
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Turn your video into a stream.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
            Upload an MP4 or MOV file. It is converted to adaptive HLS locally and is ready to play in your browser.
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-3 shadow-2xl shadow-black/30 sm:p-5">
          {phase === "completed" && playlistUrl ? (
            <div className="space-y-4">
              <HlsPlayer source={playlistUrl} />
              <button type="button" className="secondary-button" onClick={reset}>
                Upload another video
              </button>
            </div>
          ) : (
            <UploadZone onFile={uploadVideo} disabled={isWorking} />
          )}

          {isWorking && (
            <div className="px-3 pb-3 pt-6 sm:px-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-200">
                  {phase === "uploading" ? "Uploading video" : "Creating adaptive HLS stream"}
                </span>
                <span className="tabular-nums text-cyan-300">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {phase === "uploading"
                  ? "Keep this page open while your file is uploaded."
                  : "FFmpeg is creating 360p, 480p, and 720p renditions with 6-second segments."}
              </p>
            </div>
          )}

          {phase === "failed" && (
            <div className="m-3 rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-4 sm:m-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-400/15 text-sm text-red-300">!</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-red-200">Video processing failed</p>
                  <p className="mt-1 break-words text-sm leading-5 text-red-200/70">{error}</p>
                  <button type="button" className="mt-3 text-sm font-medium text-red-200 underline underline-offset-4" onClick={reset}>
                    Try another file
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
