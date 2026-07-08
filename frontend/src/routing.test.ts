import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  breadcrumbsForPath,
  displayDocumentPath,
  documentHrefForPath,
  documentPathFromLocation,
  internalDocumentPathForLink,
  parentPathFor,
} from "./routing";

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

  it.each([
    ["", []],
    ["a", [""]],
    ["a/b/c.md", ["", "a", "a/b"]],
  ])("lists tree ancestors of %j", (path, expected) => {
    expect(ancestorsOf(path)).toEqual(expected);
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
