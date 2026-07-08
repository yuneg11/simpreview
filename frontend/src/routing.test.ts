import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  breadcrumbsForPath,
  displayDocumentPath,
  documentHrefForPath,
  documentPathFromLocation,
  hasExternalIntent,
  internalDocumentPathForLink,
  isPlainPrimaryClick,
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

describe("isPlainPrimaryClick", () => {
  const plainClick = {
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  } as MouseEvent;

  it("returns true for a plain left-button click without modifiers", () => {
    expect(isPlainPrimaryClick(plainClick)).toBe(true);
  });

  it("returns false when the button is not the primary button", () => {
    expect(isPlainPrimaryClick({ ...plainClick, button: 1 } as MouseEvent)).toBe(
      false,
    );
  });

  it.each([
    ["altKey", { ...plainClick, altKey: true } as MouseEvent],
    ["ctrlKey", { ...plainClick, ctrlKey: true } as MouseEvent],
    ["metaKey", { ...plainClick, metaKey: true } as MouseEvent],
    ["shiftKey", { ...plainClick, shiftKey: true } as MouseEvent],
  ])("returns false when %s modifier is held", (_name, event) => {
    expect(isPlainPrimaryClick(event)).toBe(false);
  });
});

describe("hasExternalIntent", () => {
  it("returns false for a plain internal anchor", () => {
    const anchor = document.createElement("a");
    anchor.href = "/docs/readme.md";
    expect(hasExternalIntent(anchor)).toBe(false);
  });

  it("returns true when the download attribute is present", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("download", "");
    expect(hasExternalIntent(anchor)).toBe(true);
  });

  it("returns true when target is _blank", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("target", "_blank");
    expect(hasExternalIntent(anchor)).toBe(true);
  });

  it("returns false when target is _self", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("target", "_self");
    expect(hasExternalIntent(anchor)).toBe(false);
  });

  it("returns false when target is empty", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("target", "");
    expect(hasExternalIntent(anchor)).toBe(false);
  });

  it("returns false when target is absent", () => {
    const anchor = document.createElement("a");
    expect(hasExternalIntent(anchor)).toBe(false);
  });
});
