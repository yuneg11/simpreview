import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import type { Directory } from "../api";
import { DirectoryView } from "./DirectoryView";
import { ErrorView } from "./StatusViews";
import { ApiError } from "../api";

function directory(overrides: Partial<Directory>): Directory {
  return {
    kind: "directory",
    path: "docs",
    canonicalPath: "docs",
    entries: [],
    truncated: false,
    ...overrides,
  };
}

describe("DirectoryView", () => {
  afterEach(cleanup);

  it("renders entries as document links with size and time", () => {
    const { container } = render(
      <DirectoryView
        node={directory({
          entries: [
            { name: "sub", path: "docs/sub", kind: "directory", size: 0, modified: "2026-07-08T00:00:00.000Z", symlink: false },
            { name: "a.md", path: "docs/a.md", kind: "file", size: 2048, modified: "2026-07-08T00:00:00.000Z", symlink: false },
          ],
        })}
      />,
    );
    expect(container.querySelector('a[data-doc-path="docs/sub"]')).not.toBeNull();
    expect(container.querySelector('a[data-doc-path="docs/a.md"]')).not.toBeNull();
    expect(container.textContent).toContain("2 KB");
  });

  it("shows a truncation notice", () => {
    const { container } = render(<DirectoryView node={directory({ truncated: true })} />);
    expect(container.querySelector(".notice")).not.toBeNull();
  });

  it("shows an empty-directory message", () => {
    const { container } = render(<DirectoryView node={directory({ entries: [] })} />);
    expect(container.textContent).toContain("empty");
  });
});

describe("ErrorView", () => {
  afterEach(cleanup);

  it("shows the API error message and status", () => {
    const { container } = render(
      <ErrorView path="secret" error={new ApiError(403, "forbidden", "hidden paths are disabled")} />,
    );
    expect(container.textContent).toContain("hidden paths are disabled");
    expect(container.textContent).toContain("403");
  });
});
