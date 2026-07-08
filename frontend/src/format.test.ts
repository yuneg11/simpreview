import { describe, expect, it } from "vitest";
import { countLines, formatModified, formatSize } from "./format";

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [2048, "2 KB"],
    [1536, "1.5 KB"],
    [5 * 1024 * 1024, "5 MB"],
  ])("formats %d bytes as %j", (size, expected) => {
    expect(formatSize(size)).toBe(expected);
  });

  it("returns a dash for invalid sizes", () => {
    expect(formatSize(-1)).toBe("--");
  });
});

describe("countLines", () => {
  it.each([
    ["", 0],
    ["one line", 1],
    ["a\nb\nc", 3],
    ["a\nb\n", 2],
  ])("counts lines of %j as %d", (content, expected) => {
    expect(countLines(content)).toBe(expected);
  });
});

describe("formatModified", () => {
  it("returns empty string for invalid dates", () => {
    expect(formatModified("not-a-date")).toBe("");
  });

  it("formats valid ISO timestamps to a non-empty string", () => {
    expect(formatModified("2026-07-08T00:00:00.000Z")).not.toBe("");
  });
});
