import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import type { File } from "./api";
import { App } from "./App";
import { currentPath, tree, view } from "./state";

function markdownFile(content: string): File {
  return {
    kind: "file",
    path: "README.md",
    canonicalPath: "/tmp/root/README.md",
    mime: "text/markdown; charset=utf-8",
    renderMode: "markdown",
    content,
    rawURL: "/-/raw/README.md",
  };
}

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

  it("toggles the file tree sidebar open and closed", () => {
    view.value = { status: "loading", path: "" };
    const { container } = render(<App />);
    expect(container.querySelector(".file-tree")).not.toBeNull();
    fireEvent.click(container.querySelector(".sidebar-toggle") as Element);
    expect(container.querySelector(".file-tree")).toBeNull();
    expect(container.querySelector(".app-body.is-collapsed")).not.toBeNull();
    fireEvent.click(container.querySelector(".sidebar-toggle") as Element);
    expect(container.querySelector(".file-tree")).not.toBeNull();
  });

  it("shows file actions in the header row and toggles Code/Preview", () => {
    currentPath.value = "README.md";
    view.value = { status: "loaded", node: markdownFile("# Title\n\nHello") };
    const { container } = render(<App />);
    // File meta + toggle live in the header row, not inside the content card.
    const header = container.querySelector(".content-header");
    expect(header?.querySelector(".file-actions .file-meta")?.textContent).toContain("3 lines");
    expect(container.querySelector(".content-body .file-header")).toBeNull();
    expect(container.querySelector(".markdown-body")).not.toBeNull();
    fireEvent.click(container.querySelector(".toggle-source") as Element);
    expect(container.querySelector(".markdown-body")).toBeNull();
    expect(container.querySelector(".code-view")).not.toBeNull();
  });
});
