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

  it("renders an inline image for image binaries", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "logo.png",
          mime: "image/png",
          renderMode: "binary",
          content: undefined,
          rawURL: "/-/raw/logo.png",
        })}
        showSource={false}
      />,
    );
    expect(container.querySelector(".binary-view img")?.getAttribute("src")).toBe("/-/raw/logo.png");
  });

  it("shows a download panel for non-image binaries", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "data.bin",
          mime: "application/octet-stream",
          renderMode: "binary",
          content: undefined,
          rawURL: "/-/raw/data.bin",
        })}
        showSource={false}
      />,
    );
    expect(container.querySelector(".binary-view img")).toBeNull();
    expect(container.textContent.toLowerCase()).toContain("binary");
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

  it("omits line meta and the Copy action for binary files", () => {
    const { container } = render(
      <FileActions
        node={file({
          path: "logo.png",
          mime: "image/png",
          renderMode: "binary",
          content: undefined,
          rawURL: "/-/raw/logo.png",
        })}
        showSource={false}
        onToggleSource={() => {}}
      />,
    );
    expect(container.querySelector(".file-meta")).toBeNull();
    expect(container.querySelector('[aria-label="Copy file contents"]')).toBeNull();
    expect(container.textContent).toContain("Raw");
    expect(container.querySelector('a[download][aria-label="Download file"]')).not.toBeNull();
  });
});
