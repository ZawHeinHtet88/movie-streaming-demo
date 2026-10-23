import { describe, expect, it } from "vitest";
import { createStatusStore } from "../../apps/server/src/status-store.js";

describe("status store", () => {
  it("creates and updates an isolated video status", () => {
    const store = createStatusStore();
    store.create("video-1", { status: "uploading", progress: 0 });
    store.update("video-1", { status: "converting", progress: 42 });

    expect(store.get("video-1")).toMatchObject({
      id: "video-1",
      status: "converting",
      progress: 42
    });
  });

  it("does not expose mutable internal records", () => {
    const store = createStatusStore();
    store.create("video-1", { status: "converting" });
    const snapshot = store.get("video-1");
    snapshot.status = "failed";

    expect(store.get("video-1").status).toBe("converting");
  });

  it("returns null for an unknown video", () => {
    expect(createStatusStore().get("missing")).toBeNull();
  });
});
