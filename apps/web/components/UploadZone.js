"use client";

import { useRef, useState } from "react";

const MAX_SIZE = 500 * 1024 * 1024;
const VALID_TYPES = new Set(["video/mp4", "video/quicktime"]);

export default function UploadZone({ onFile, disabled = false }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState("");

  const selectFile = (file) => {
    setValidationError("");
    if (!file) return;
    if (!VALID_TYPES.has(file.type)) {
      setValidationError("Choose an MP4 or MOV video file.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setValidationError("The video must be 500 MB or smaller.");
      return;
    }
    onFile(file);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={onDrop}
        className={`group flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-all duration-200 ${
          dragging
            ? "border-cyan-300 bg-cyan-300/[0.08]"
            : "border-slate-700 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-900/60"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-cyan-300 shadow-lg shadow-black/20 transition-transform group-hover:-translate-y-1">
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-lg font-medium text-slate-100">
          {disabled ? "Video is being processed" : "Drop your video here"}
        </span>
        <span className="mt-2 text-sm text-slate-500">
          or <span className="font-medium text-cyan-300">browse from your computer</span>
        </span>
        <span className="mt-5 rounded-full bg-white/[0.04] px-3 py-1 text-xs text-slate-500">
          MP4 or MOV · up to 500 MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {validationError && (
        <p role="alert" className="mt-3 text-center text-sm text-red-300">{validationError}</p>
      )}
    </div>
  );
}
