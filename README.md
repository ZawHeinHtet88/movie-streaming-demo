# Local HLS Video MVP

A minimal local video pipeline built with Next.js, Tailwind CSS, Express, FFmpeg, and HLS.js. Users can upload an MP4 or MOV file, monitor upload and conversion progress, and play the generated HLS stream in the browser.

## Project structure

```text
movie-streaming-demo/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── app.js                # Express API and upload workflow
│   │   │   ├── config.js             # Local configuration
│   │   │   ├── hls-converter.js      # Safe FFmpeg spawn implementation
│   │   │   ├── server.js             # API entry point
│   │   │   ├── status-store.js       # In-memory conversion states
│   │   │   └── video-validation.js   # File and path validation
│   │   ├── .env.example
│   │   └── package.json               # Marks backend source as ESM
│   └── web/
│       ├── app/
│       │   ├── globals.css
│       │   ├── layout.js
│       │   └── page.js
│       ├── components/
│       │   ├── HlsPlayer.js
│       │   └── UploadZone.js
│       ├── .env.local.example
│       ├── postcss.config.js
│       └── tailwind.config.js
├── storage/
│   ├── uploads/                       # Temporary source files
│   └── videos/
│       └── <video-uuid>/
│           ├── index.m3u8              # Adaptive master playlist
│           ├── 360p/index.m3u8 + segments
│           ├── 480p/index.m3u8 + segments
│           └── 720p/index.m3u8 + segments
├── test/
│   ├── integration/api.test.js
│   └── unit/
│       ├── hls-converter.test.js
│       ├── status-store.test.js
│       └── video-validation.test.js
├── package.json
└── vitest.config.js
```

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- FFmpeg available on `PATH`

Verify both tools before starting:

```bash
node --version
ffmpeg -version
```

### Install FFmpeg

Choose the command for your operating system:

```bash
# Windows (winget)
winget install Gyan.FFmpeg

# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg
```

Restart the terminal after a Windows installation so the updated `PATH` is available. If FFmpeg is installed elsewhere, copy `apps/server/.env.example` to `apps/server/.env` and set `FFMPEG_PATH` to the executable's absolute path.

## Install and run

1. Install all frontend, backend, and test dependencies from the project root:

   ```bash
   npm install
   ```

2. Optional: create local environment files. The defaults already work for ports 3000 and 4000.

   ```powershell
   # Windows PowerShell
   Copy-Item apps/server/.env.example apps/server/.env
   Copy-Item apps/web/.env.local.example apps/web/.env.local
   ```

   ```bash
   # macOS/Linux
   cp apps/server/.env.example apps/server/.env
   cp apps/web/.env.local.example apps/web/.env.local
   ```

3. Start the API and Next.js app together:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:3000>, drop an MP4/MOV file into the upload area, and wait for conversion to complete. The Express API runs at <http://localhost:4000>.

5. Stop both processes with `Ctrl+C`.

## Test

The project follows a test-first layout. Unit tests cover validation, status state, and FFmpeg arguments/progress. Integration tests upload multipart files and verify status transitions, cleanup, errors, and HLS MIME types.

```bash
npm test                  # all tests
npm run test:unit         # test/unit only
npm run test:integration  # test/integration only
npm run test:watch        # TDD watch mode
```

Build and run in production mode:

```bash
npm run build
npm start
```

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/upload` | Multipart upload using field name `video`; starts conversion |
| `GET` | `/api/status/:id` | Returns `uploading`, `converting`, `completed`, or `failed` state |
| `GET` | `/api/videos/:id/index.m3u8` | Serves the HLS playlist |
| `GET` | `/api/videos/:id/:quality/index.m3u8` | Serves a 360p, 480p, or 720p rendition playlist |
| `GET` | `/api/videos/:id/:quality/:segment` | Serves a rendition's generated `.ts` segments |

Example upload:

```bash
curl -F "video=@./sample.mp4" http://localhost:4000/api/upload
```

Use the returned UUID with the status endpoint:

```bash
curl http://localhost:4000/api/status/RETURNED_UUID
```

## Conversion and storage behavior

- The upload limit defaults to 500 MB and can be changed with `MAX_FILE_SIZE_MB`.
- FFmpeg generates 360p, 480p, and 720p H.264 renditions, optional AAC audio, an adaptive master playlist, and keyframe-aligned 6-second MPEG-TS segments.
- HLS.js starts in automatic bitrate mode. Chrome, Edge, and Firefox users can manually choose 360p, 480p, or 720p in the player. Safari uses its native automatic HLS selection.
- FFmpeg arguments are passed as an array to `child_process.spawn()` with `shell: false`; user input is never interpolated into a shell command.
- The original upload is removed after conversion finishes or fails. Partial HLS output is removed after a failed conversion.
- Completed streams stay under `storage/videos/<uuid>` until manually deleted.
- Status is intentionally in memory because this MVP has no database. Restarting the server clears status records but does not delete completed HLS files.
