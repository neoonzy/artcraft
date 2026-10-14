import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorCore } from "../index";
import { SaveManager } from "./save-manager";

function createEditor(saveCurrentProject: () => Promise<void>): EditorCore {
  return {
    project: {
      getActive: () => ({ metadata: { id: "draft" } }),
      getIsLoading: () => false,
      getMigrationState: () => ({ isMigrating: false }),
      saveCurrentProject,
    },
    scenes: { subscribe: () => () => {} },
    timeline: { subscribe: () => () => {} },
  } as unknown as EditorCore;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SaveManager persistence failures", () => {
  it("keeps edits dirty after an explicit save failure and permits a retry", async () => {
    const saveCurrentProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    const manager = new SaveManager({ editor: createEditor(saveCurrentProject) });

    await expect(manager.flush()).rejects.toThrow("disk full");
    expect(manager.getIsDirty()).toBe(true);

    await manager.flush();
    expect(manager.getIsDirty()).toBe(false);
    expect(saveCurrentProject).toHaveBeenCalledTimes(2);
    manager.stop();
  });

  it("handles failed autosaves, retains dirty state, and retries on the next edit", async () => {
    vi.useFakeTimers();
    const error = new Error("disk full");
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const saveCurrentProject = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const manager = new SaveManager({
      editor: createEditor(saveCurrentProject),
      debounceMs: 5,
    });

    manager.markDirty();
    await vi.advanceTimersByTimeAsync(5);

    expect(logError).toHaveBeenCalledWith("Video project autosave failed:", error);
    expect(manager.getIsDirty()).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(saveCurrentProject).toHaveBeenCalledTimes(1);

    manager.markDirty();
    await vi.advanceTimersByTimeAsync(5);
    expect(saveCurrentProject).toHaveBeenCalledTimes(2);
    expect(manager.getIsDirty()).toBe(false);
    manager.stop();
  });
});
