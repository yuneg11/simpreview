import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { File } from "../api";
import { FileActions, FileView } from "./FileView";

function file(overrides: Partial<File>): File {
  return {
    kind: "file",
    path: "example.txt",
    canonicalPath: "/tmp/root/example.txt",
    mime: "text/plain; charset=utf-8",
    renderMode: "text",
    size: 0,
    content: "",
    ...overrides,
  };
}

describe("FileView", () => {
  afterEach(cleanup);

  it("renders markdown as a markdown-body when showSource is false", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "README.md",
          mime: "text/markdown; charset=utf-8",
          renderMode: "markdown",
          content: "# Title\n\nHello",
          rawURL: "/-/raw/README.md",
        })}
        showSource={false}
      />,
    );
    expect(container.querySelector(".markdown-body h1")?.textContent).toBe("Title");
    expect(container.querySelector(".code-view")).toBeNull();
  });

  it("renders markdown source when showSource is true", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "README.md",
          mime: "text/markdown; charset=utf-8",
          renderMode: "markdown",
          content: "# Title\n\nHello",
        })}
        showSource={true}
      />,
    );
    expect(container.querySelector(".markdown-body")).toBeNull();
    expect(container.querySelector(".code-view")).not.toBeNull();
  });

  it("renders source with a line-number gutter and highlighting", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "app.ts",
          mime: "text/typescript; charset=utf-8",
          renderMode: "source",
          content: "const x = 1;\nconst y = 2;",
        })}
        showSource={false}
      />,
    );
    expect(container.querySelectorAll(".code-line-no").length).toBe(2);
    expect(container.querySelector(".code-body .hljs-keyword")).not.toBeNull();
  });

  it("renders a download panel (no inline preview) for binary files, including images", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "logo.png",
          mime: "image/png",
          renderMode: "binary",
          content: undefined,
          rawURL: "/-/raw/logo.png",
          size: 2048,
        })}
        showSource={false}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".code-view")).toBeNull();
    expect(container.querySelector(".binary-view a[download]")?.getAttribute("href")).toBe(
      "/-/raw/logo.png",
    );
    expect(container.textContent?.toLowerCase()).toContain("binary");
  });

  it("renders a download panel for files too large to preview", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "huge.log",
          renderMode: "text",
          content: undefined,
          tooLarge: true,
          rawURL: "/-/raw/huge.log",
          size: 5_000_000,
        })}
        showSource={false}
      />,
    );
    expect(container.querySelector(".code-view")).toBeNull();
    expect(container.querySelector(".file-view.is-code")).toBeNull();
    expect(container.querySelector(".binary-view a[download]")?.getAttribute("href")).toBe(
      "/-/raw/huge.log",
    );
    expect(container.textContent?.toLowerCase()).toContain("too large");
  });
});

describe("FileActions", () => {
  afterEach(cleanup);

  it("shows line count + a Code toggle for markdown and fires onToggleSource", () => {
    const onToggleSource = vi.fn();
    const { container } = render(
      <FileActions
        node={file({
          path: "README.md",
          mime: "text/markdown; charset=utf-8",
          renderMode: "markdown",
          content: "# Title\n\nHello",
          size: 13,
          rawURL: "/-/raw/README.md",
        })}
        showSource={false}
        onToggleSource={onToggleSource}
      />,
    );
    expect(container.querySelector(".file-meta")?.textContent).toContain("3 lines");
    const toggle = container.querySelector(".toggle-source") as Element;
    expect(toggle.textContent).toBe("Code");
    fireEvent.click(toggle);
    expect(onToggleSource).toHaveBeenCalledTimes(1);
  });

  it("labels the toggle Preview when source is shown", () => {
    const { container } = render(
      <FileActions
        node={file({
          path: "README.md",
          mime: "text/markdown; charset=utf-8",
          renderMode: "markdown",
          content: "# Title",
        })}
        showSource={true}
        onToggleSource={() => {}}
      />,
    );
    expect(container.querySelector(".toggle-source")?.textContent).toBe("Preview");
  });

  it("shows meta and Raw/Copy/Download for a source file, no markdown toggle", () => {
    const { container } = render(
      <FileActions
        node={file({
          path: "app.ts",
          mime: "text/typescript; charset=utf-8",
          renderMode: "source",
          content: "const x = 1;\nconst y = 2;",
          size: 25,
          rawURL: "/-/raw/app.ts",
        })}
        showSource={false}
        onToggleSource={() => {}}
      />,
    );
    expect(container.querySelector(".file-meta")?.textContent).toContain("2 lines");
    expect(container.querySelector(".toggle-source")).toBeNull();
    expect(container.textContent).toContain("Raw");
    expect(container.querySelector('[aria-label="Copy file contents"]')).not.toBeNull();
    expect(container.querySelector('a[download][aria-label="Download file"]')).not.toBeNull();
  });

  it("shows size but no lines/Copy/toggle for binary files", () => {
    const { container } = render(
      <FileActions
        node={file({
          path: "logo.png",
          mime: "image/png",
          renderMode: "binary",
          content: undefined,
          size: 2048,
          rawURL: "/-/raw/logo.png",
        })}
        showSource={false}
        onToggleSource={() => {}}
      />,
    );
    const meta = container.querySelector(".file-meta")?.textContent ?? "";
    expect(meta).toContain("2 KB");
    expect(meta).not.toContain("lines");
    expect(container.querySelector(".toggle-source")).toBeNull();
    expect(container.querySelector('[aria-label="Copy file contents"]')).toBeNull();
    expect(container.textContent).toContain("Raw");
    expect(container.querySelector('a[download][aria-label="Download file"]')).not.toBeNull();
  });

  it("shows size but no lines/Copy for too-large files", () => {
    const { container } = render(
      <FileActions
        node={file({
          path: "huge.log",
          renderMode: "text",
          content: undefined,
          tooLarge: true,
          size: 5_000_000,
          rawURL: "/-/raw/huge.log",
        })}
        showSource={false}
        onToggleSource={() => {}}
      />,
    );
    const meta = container.querySelector(".file-meta")?.textContent ?? "";
    expect(meta).not.toContain("lines");
    expect(container.querySelector('[aria-label="Copy file contents"]')).toBeNull();
    expect(container.querySelector('a[download][aria-label="Download file"]')).not.toBeNull();
  });
});
