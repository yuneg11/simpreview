import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { File } from "../api";
import { FileView } from "./FileView";

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

  it("renders markdown as a markdown-body by default and toggles to source", () => {
    const { container } = render(
      <FileView
        node={file({
          path: "README.md",
          mime: "text/markdown; charset=utf-8",
          renderMode: "markdown",
          content: "# Title\n\nHello",
          rawURL: "/-/raw/README.md",
        })}
      />,
    );
    expect(container.querySelector(".markdown-body h1")?.textContent).toBe("Title");
    fireEvent.click(container.querySelector(".toggle-source") as Element);
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
      />,
    );
    expect(container.querySelectorAll(".code-line-no").length).toBe(2);
    expect(container.querySelector(".code-body .hljs-keyword")).not.toBeNull();
    expect(container.textContent).toContain("2 lines");
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
      />,
    );
    expect(container.querySelector(".binary-view img")).toBeNull();
    expect(container.textContent.toLowerCase()).toContain("binary");
  });
});
