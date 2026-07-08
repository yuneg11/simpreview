import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureFolder,
  loadPath,
  revealPath,
  toggleFolder,
  tree,
  view,
  withFolder,
} from "./state";

function directoryResponse(path = "docs") {
  return new Response(
    JSON.stringify({
      kind: "directory",
      path,
      canonicalPath: path,
      entries: [
        {
          name: "readme.md",
          path: `${path}/readme.md`,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
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

  it("expands a collapsed folder with cached entries without fetching", () => {
    tree.value = withFolder(new Map(), "docs", {
      expanded: false,
      loading: false,
      entries: [],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    toggleFolder("docs");

    expect(tree.value.get("docs")?.expanded).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadPath stale-request guard", () => {
  afterEach(() => {
    tree.value = new Map();
    view.value = { status: "loading", path: "" };
    vi.unstubAllGlobals();
  });

  it("keeps the newest result even when a stale fetch resolves later", async () => {
    const pending: Array<ReturnType<typeof deferred<Response>>> = [];
    const fetchMock = vi.fn((): Promise<Response> => {
      const entry = deferred<Response>();
      pending.push(entry);
      return entry.promise;
    });
    vi.stubGlobal("fetch", fetchMock);

    const stale = loadPath("first");
    const fresh = loadPath("second");

    // Both requests are in flight; the newer one resolves first.
    expect(pending).toHaveLength(2);
    pending[1].resolve(directoryResponse("second"));
    await fresh;

    let settled = view.value;
    expect(settled.status).toBe("loaded");
    if (settled.status === "loaded") {
      expect(settled.node.path).toBe("second");
    }

    // The stale request resolves afterwards and must NOT flip the view back.
    pending[0].resolve(directoryResponse("first"));
    await stale;

    settled = view.value;
    expect(settled.status).toBe("loaded");
    if (settled.status === "loaded") {
      expect(settled.node.path).toBe("second");
    }
  });
});

describe("ensureFolder error path", () => {
  afterEach(() => {
    tree.value = new Map();
    vi.unstubAllGlobals();
  });

  it("records the error and retries on the next call", async () => {
    const failMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", failMock);

    await ensureFolder("docs");
    expect(tree.value.get("docs")).toEqual({
      expanded: true,
      loading: false,
      error: true,
    });
    expect(failMock).toHaveBeenCalledTimes(1);

    const okMock = vi.fn(async () => directoryResponse());
    vi.stubGlobal("fetch", okMock);

    await ensureFolder("docs");
    expect(okMock).toHaveBeenCalledTimes(1);
    expect(tree.value.get("docs")?.entries?.[0].name).toBe("readme.md");
    expect(tree.value.get("docs")?.loading).toBe(false);
    expect(tree.value.get("docs")?.error).toBe(false);
  });
});

describe("revealPath", () => {
  afterEach(() => {
    tree.value = new Map();
    vi.unstubAllGlobals();
  });

  it("ensures every ancestor folder of the target path", async () => {
    const fetchMock = vi.fn(async () => directoryResponse());
    vi.stubGlobal("fetch", fetchMock);

    await revealPath("a/b/c.md");

    expect(tree.value.has("")).toBe(true);
    expect(tree.value.has("a")).toBe(true);
    expect(tree.value.has("a/b")).toBe(true);
    expect(tree.value.get("a")?.entries).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
