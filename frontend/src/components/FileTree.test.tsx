import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { FolderState } from "../state";
import { FileTree } from "./FileTree";

function treeWith(entries: Partial<FolderState>) {
  const map = new Map<string, FolderState>();
  map.set("", { expanded: true, loading: false, entries: [], ...entries });
  return map;
}

describe("FileTree", () => {
  afterEach(cleanup);

  it("renders root entries and marks the active file", () => {
    const tree = treeWith({
      entries: [
        { name: "docs", path: "docs", kind: "directory", size: 0, modified: "", symlink: false },
        { name: "readme.md", path: "readme.md", kind: "file", size: 1, modified: "", symlink: false },
      ],
    });
    const { container } = render(
      <FileTree tree={tree} currentPath="readme.md" onToggle={() => {}} />,
    );
    expect(container.querySelector(".tree-file.is-active")?.textContent).toContain("readme.md");
    expect(container.querySelector('a[data-doc-path="readme.md"]')).not.toBeNull();
  });

  it("calls onToggle when a folder row is clicked", () => {
    const tree = treeWith({
      entries: [
        { name: "docs", path: "docs", kind: "directory", size: 0, modified: "", symlink: false },
      ],
    });
    const onToggle = vi.fn();
    const { container } = render(
      <FileTree tree={tree} currentPath="" onToggle={onToggle} />,
    );
    fireEvent.click(container.querySelector(".tree-folder-row") as Element);
    expect(onToggle).toHaveBeenCalledWith("docs");
  });

  it("renders nested children of an expanded folder", () => {
    const tree = new Map<string, FolderState>();
    tree.set("", {
      expanded: true,
      loading: false,
      entries: [
        { name: "docs", path: "docs", kind: "directory", size: 0, modified: "", symlink: false },
      ],
    });
    tree.set("docs", {
      expanded: true,
      loading: false,
      entries: [
        { name: "a.md", path: "docs/a.md", kind: "file", size: 1, modified: "", symlink: false },
      ],
    });
    const { container } = render(
      <FileTree tree={tree} currentPath="" onToggle={() => {}} />,
    );
    expect(container.querySelector('a[data-doc-path="docs/a.md"]')).not.toBeNull();
  });
});
