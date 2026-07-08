import { afterEach, describe, expect, it, vi } from "vitest";

import {
  breadcrumbsForPath,
  documentHrefForPath,
  documentPathFromLocation,
  displayDocumentPath,
  internalDocumentPathForLink,
  parentPathFor,
} from "./main";

describe("document path helpers", () => {
  it.each([
    ["/", ""],
    ["/docs/readme.md", "docs/readme.md"],
    ["/space%20dir/100%25.md", "space dir/100%.md"],
  ])("maps location pathname %j to document path %j", (pathname, expected) => {
    expect(documentPathFromLocation(pathname)).toBe(expected);
  });

  it.each([
    ["", "/"],
    ["docs/readme.md", "/docs/readme.md"],
  ])("formats document path %j as %j", (path, expected) => {
    expect(displayDocumentPath(path)).toBe(expected);
  });

  it("builds breadcrumbs from root to the current path", () => {
    expect(breadcrumbsForPath("docs/guides/readme.md")).toEqual([
      { label: "root", path: "" },
      { label: "docs", path: "docs" },
      { label: "guides", path: "docs/guides" },
      { label: "readme.md", path: "docs/guides/readme.md" },
    ]);
  });

  it.each([
    ["", null],
    ["docs", ""],
    ["docs/readme.md", "docs"],
  ])("finds parent path for %j", (path, expected) => {
    expect(parentPathFor(path)).toBe(expected);
  });

  it.each([
    ["", "/"],
    ["docs/readme.md", "/docs/readme.md"],
    ["space dir/100%.md", "/space%20dir/100%25.md"],
  ])("builds app href for %j", (path, expected) => {
    expect(documentHrefForPath(path)).toBe(expected);
  });
});

describe("rendered link classification", () => {
  const currentURL = new URL("http://preview.local/docs/readme.md");

  it.each([
    ["/docs/other.md", "docs/other.md"],
    ["../index.md", "index.md"],
    ["space%20dir/100%25.md", "docs/space dir/100%.md"],
  ])("treats %j as an internal document link", (href, expected) => {
    expect(internalDocumentPathForLink(href, currentURL)).toBe(expected);
  });

  it.each([
    ["http://example.com/readme.md"],
    ["mailto:docs@example.com"],
    ["/-/raw/docs/readme.md"],
    ["/-/api/fs/docs/readme.md"],
    ["#section"],
    ["//example.com/readme.md"],
    ["javascript:alert(1)"],
    ["blob:http://preview.local/asset"],
  ])("does not intercept %j", (href) => {
    expect(internalDocumentPathForLink(href, currentURL)).toBeNull();
  });
});

describe("document browser accessibility", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it("renders directory entries as native links without artificial list roles", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            kind: "directory",
            path: "",
            canonicalPath: "",
            entries: [
              {
                name: "docs",
                path: "docs",
                kind: "directory",
                size: 0,
                modified: "2026-07-08T00:00:00.000Z",
                symlink: false,
              },
            ],
            truncated: false,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    vi.resetModules();
    await import("./main");

    await vi.waitFor(() => {
      const entryList = document.querySelector<HTMLElement>(".entry-list");
      const entry = document.querySelector<HTMLAnchorElement>(".entry-row");

      expect(entryList?.getAttribute("role")).toBeNull();
      expect(entry?.tagName).toBe("A");
      expect(entry?.getAttribute("href")).toBe("/docs");
      expect(entry?.getAttribute("role")).toBeNull();
    });
  });
});
