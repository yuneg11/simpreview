import { describe, expect, it } from "vitest";

import type { File } from "./api";
import { highlightSource, isSafeHref, renderMarkdown } from "./render";

function file(overrides: Partial<File>): File {
  return {
    kind: "file",
    path: "example.txt",
    canonicalPath: "/tmp/root/example.txt",
    mime: "text/plain; charset=utf-8",
    renderMode: "text",
    content: "",
    ...overrides,
  };
}

function fragmentFor(html: string): HTMLDivElement {
  const fragment = document.createElement("div");
  fragment.innerHTML = html;
  return fragment;
}

describe("renderMarkdown security", () => {
  it("strips script tags and inline event handlers", () => {
    const html = renderMarkdown(
      '# Hi\n\n<script>alert("bad")</script>\n<img src=x onerror="alert(1)">',
    );
    const fragment = fragmentFor(html);
    expect(fragment.querySelector("script")).toBeNull();
    expect(fragment.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("removes javascript links", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    const link = fragmentFor(html).querySelector("a");
    expect(fragmentFor(html).textContent).toContain("click me");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect(html).not.toContain("javascript:");
  });

  it("highlights common code fences", () => {
    const html = renderMarkdown("```ts\nconst answer: number = 42;\n```");
    const code = fragmentFor(html).querySelector("pre code");
    expect(code?.className).toContain("hljs");
    expect(code?.innerHTML).toContain("hljs-keyword");
  });

  it("escapes unknown code fence languages", () => {
    const html = renderMarkdown(
      '```mysterylang\n<img src=x onerror="alert(1)">\n```',
    );
    const fragment = fragmentFor(html);
    expect(fragment.querySelector("img")).toBeNull();
    expect(html).toContain("&lt;img src=x");
  });

  it("neutralizes hostile fence language names", () => {
    const html = renderMarkdown(
      '```"><img src=x onerror=alert(1)>\nconst safe = true;\n```',
    );
    const fragment = fragmentFor(html);
    expect(fragment.querySelector("img")).toBeNull();
    expect(html).not.toContain("onerror");
  });

  it("removes unsafe image sources", () => {
    const html = renderMarkdown("![bad](javascript:alert(1))");
    const image = fragmentFor(html).querySelector("img");
    expect(image?.getAttribute("src")).toBeNull();
    expect(image?.getAttribute("alt")).toBe("bad");
    expect(html).not.toContain("javascript:");
  });
});

describe("highlightSource", () => {
  it("escapes source content instead of interpreting HTML", () => {
    const result = highlightSource('<img src=x onerror="alert(1)">\nconst x = 1;', file({
      path: "app.ts",
      mime: "text/typescript; charset=utf-8",
      renderMode: "source",
    }));
    const fragment = fragmentFor(result.html);
    expect(fragment.querySelector("img")).toBeNull();
    expect(result.html).toContain("&lt;img");
    expect(result.lineCount).toBe(2);
  });

  it("highlights a known language", () => {
    const result = highlightSource("const answer: number = 42;", file({
      path: "app.ts",
      mime: "text/typescript; charset=utf-8",
      renderMode: "source",
    }));
    expect(result.language).toBe("typescript");
    expect(result.html).toContain("hljs-keyword");
    expect(result.lineCount).toBe(1);
  });

  it("escapes plain text with no language and drops one trailing newline", () => {
    const result = highlightSource("<b>hi</b>\nplain\n", file({
      path: "notes.txt",
      mime: "text/plain; charset=utf-8",
      renderMode: "text",
    }));
    expect(result.language).toBeUndefined();
    expect(result.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(result.lineCount).toBe(2);
  });
});

describe("isSafeHref", () => {
  it("accepts safe hrefs", () => {
    expect(isSafeHref("#section")).toBe(true);
    expect(isSafeHref("/docs/a.md")).toBe(true);
    expect(isSafeHref("https://example.com")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(true);
    expect(isSafeHref("mailto:x@example.com")).toBe(true);
  });

  it("rejects unsafe or empty hrefs", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.com")).toBe(false);
    expect(isSafeHref("/\\evil.com")).toBe(false);
    expect(isSafeHref("blob:https://x/y")).toBe(false);
    expect(isSafeHref("")).toBe(false);
    expect(isSafeHref("   ")).toBe(false);
  });
});
