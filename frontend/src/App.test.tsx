import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/preact";
import { App } from "./App";
import { currentPath, tree, view } from "./state";

function directoryResponse(entries: unknown[]) {
  return new Response(
    JSON.stringify({ kind: "directory", path: "", canonicalPath: "", entries, truncated: false }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("App", () => {
  beforeEach(() => {
    currentPath.value = "";
    tree.value = new Map();
    view.value = { status: "loading", path: "" };
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("intercepts internal document link clicks and pushes history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        directoryResponse([
          { name: "docs", path: "docs", kind: "directory", size: 0, modified: "", symlink: false },
        ]),
      ),
    );
    // Seed a loaded directory so a link is present.
    view.value = {
      status: "loaded",
      node: {
        kind: "directory",
        path: "",
        canonicalPath: "",
        entries: [
          { name: "docs", path: "docs", kind: "directory", size: 0, modified: "", symlink: false },
        ],
        truncated: false,
      },
    };
    const { container } = render(<App />);
    const link = container.querySelector('a[data-doc-path="docs"]') as HTMLAnchorElement;
    link.click();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/docs");
    });
  });

  it("renders the error view for a failed load", () => {
    view.value = { status: "error", path: "secret", error: new Error("nope") };
    const { container } = render(<App />);
    expect(container.querySelector(".status-view.is-error")).not.toBeNull();
  });
});
