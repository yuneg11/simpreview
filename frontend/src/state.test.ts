import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureFolder, toggleFolder, tree, withFolder } from "./state";

function directoryResponse() {
  return new Response(
    JSON.stringify({
      kind: "directory",
      path: "docs",
      canonicalPath: "docs",
      entries: [
        {
          name: "readme.md",
          path: "docs/readme.md",
          kind: "file",
          size: 10,
          modified: "2026-07-08T00:00:00.000Z",
          symlink: false,
        },
      ],
      truncated: false,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("withFolder", () => {
  it("clones the map and merges the patch", () => {
    const base = new Map();
    const next = withFolder(base, "docs", { expanded: true, loading: false });
    expect(next).not.toBe(base);
    expect(next.get("docs")).toEqual({ expanded: true, loading: false });
    const merged = withFolder(next, "docs", { loading: true });
    expect(merged.get("docs")).toEqual({ expanded: true, loading: true });
  });
});

describe("ensureFolder", () => {
  afterEach(() => {
    tree.value = new Map();
    vi.unstubAllGlobals();
  });

  it("loads and stores directory children exactly once", async () => {
    const fetchMock = vi.fn(async () => directoryResponse());
    vi.stubGlobal("fetch", fetchMock);

    await ensureFolder("docs");
    expect(tree.value.get("docs")?.entries?.[0].name).toBe("readme.md");
    expect(tree.value.get("docs")?.loading).toBe(false);

    await ensureFolder("docs");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("toggleFolder", () => {
  afterEach(() => {
    tree.value = new Map();
  });

  it("collapses an expanded folder", () => {
    tree.value = withFolder(new Map(), "docs", {
      expanded: true,
      loading: false,
      entries: [],
    });
    toggleFolder("docs");
    expect(tree.value.get("docs")?.expanded).toBe(false);
  });
});
