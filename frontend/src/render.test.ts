import { describe, expect, it } from "vitest";

import type { File } from "./api";
import { renderNode } from "./render";

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

describe("renderNode markdown security", () => {
  it("strips script tags and inline event handlers from markdown HTML", () => {
    const html = renderNode(
      file({
        path: "README.md",
        mime: "text/markdown; charset=utf-8",
        renderMode: "markdown",
        content: '# Hi\n\n<script>alert("bad")</script>\n<img src=x onerror="alert(1)">',
      }),
    );

    const fragment = fragmentFor(html);

    expect(fragment.querySelector("script")).toBeNull();
    expect(fragment.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("removes javascript links from markdown output", () => {
    const html = renderNode(
      file({
        path: "README.md",
        mime: "text/markdown; charset=utf-8",
        renderMode: "markdown",
        content: "[click me](javascript:alert(1))",
      }),
    );

    const fragment = fragmentFor(html);
    const link = fragment.querySelector("a");

    expect(fragment.textContent).toContain("click me");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect(html).not.toContain("javascript:");
  });

  it("highlights common markdown code fences", () => {
    const html = renderNode(
      file({
        path: "README.md",
        mime: "text/markdown; charset=utf-8",
        renderMode: "markdown",
        content: "```ts\nconst answer: number = 42;\n```",
      }),
    );

    const code = fragmentFor(html).querySelector("pre code");

    expect(code).not.toBeNull();
    expect(code?.className).toContain("hljs");
    expect(code?.innerHTML).toContain("hljs-keyword");
  });

  it("renders escaped code for unknown markdown code fence languages", () => {
    const html = renderNode(
      file({
        path: "README.md",
        mime: "text/markdown; charset=utf-8",
        renderMode: "markdown",
        content: '```mysterylang\n<img src=x onerror="alert(1)">\n```',
      }),
    );

    const fragment = fragmentFor(html);
    const code = fragment.querySelector("pre code");

    expect(code).not.toBeNull();
    expect(code?.className).toBe("");
    expect(fragment.querySelector("img")).toBeNull();
    expect(code?.textContent).toBe('<img src=x onerror="alert(1)">\n');
    expect(html).toContain("&lt;img src=x");
  });

  it("neutralizes hostile markdown code fence language names", () => {
    const html = renderNode(
      file({
        path: "README.md",
        mime: "text/markdown; charset=utf-8",
        renderMode: "markdown",
        content: '```"><img src=x onerror=alert(1)>\nconst safe = true;\n```',
      }),
    );

    const fragment = fragmentFor(html);
    const code = fragment.querySelector("pre code");

    expect(code).not.toBeNull();
    expect(fragment.querySelector("img")).toBeNull();
    expect(code?.getAttribute("class")).toBeNull();
    expect(code?.textContent).toBe("const safe = true;\n");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  it("removes unsafe markdown image sources", () => {
    const html = renderNode(
      file({
        path: "README.md",
        mime: "text/markdown; charset=utf-8",
        renderMode: "markdown",
        content: "![bad](javascript:alert(1))",
      }),
    );

    const fragment = fragmentFor(html);
    const image = fragment.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBeNull();
    expect(image?.getAttribute("alt")).toBe("bad");
    expect(html).not.toContain("javascript:");
  });
});

describe("renderNode escaped file content", () => {
  it("escapes source content instead of interpreting it as HTML", () => {
    const html = renderNode(
      file({
        path: "app.ts",
        mime: "text/typescript; charset=utf-8",
        renderMode: "source",
        content: '<img src=x onerror="alert(1)">\nconst x = 1;',
      }),
    );

    const fragment = fragmentFor(html);

    expect(fragment.querySelector("img")).toBeNull();
    expect(fragment.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("escapes text content and preserves newlines", () => {
    const html = renderNode(
      file({
        path: "notes.txt",
        mime: "text/plain; charset=utf-8",
        renderMode: "text",
        content: "<b>not bold</b>\n  indented",
      }),
    );

    const fragment = fragmentFor(html);

    expect(fragment.querySelector("b")).toBeNull();
    expect(fragment.querySelector("pre")?.textContent).toBe(
      "<b>not bold</b>\n  indented",
    );
    expect(html).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });
});

describe("renderNode binary fallback", () => {
  it("includes a raw link when rawURL is present", () => {
    const html = renderNode(
      file({
        path: "image.png",
        mime: "image/png",
        renderMode: "binary",
        content: undefined,
        rawURL: "/-/raw/image.png",
      }),
    );

    const link = fragmentFor(html).querySelector("a");

    expect(link?.getAttribute("href")).toBe("/-/raw/image.png");
    expect(link?.textContent).toMatch(/open raw file/i);
  });

  it("does not render unsafe rawURL schemes as links", () => {
    const html = renderNode(
      file({
        path: "image.png",
        mime: "image/png",
        renderMode: "binary",
        content: undefined,
        rawURL: "javascript:alert(1)",
      }),
    );

    const fragment = fragmentFor(html);

    expect(fragment.querySelector("a")).toBeNull();
    expect(fragment.textContent).toContain("Binary preview is not available.");
    expect(html).not.toContain("javascript:");
  });
});
