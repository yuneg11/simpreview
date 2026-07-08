import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { Breadcrumb } from "./Breadcrumb";

describe("Breadcrumb", () => {
  afterEach(cleanup);

  it("renders a link per path segment with data-doc-path", () => {
    const { container } = render(<Breadcrumb path="docs/guides/readme.md" />);
    const links = container.querySelectorAll("a[data-doc-path]");
    expect(links.length).toBe(4);
    expect(links[0].getAttribute("data-doc-path")).toBe("");
    expect(links[3].getAttribute("data-doc-path")).toBe("docs/guides/readme.md");
    expect(links[3].getAttribute("href")).toBe("/docs/guides/readme.md");
  });
});
