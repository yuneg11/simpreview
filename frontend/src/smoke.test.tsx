import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";

function Hello({ name }: { name: string }) {
  return <p class="hello">Hello {name}</p>;
}

describe("preact toolchain", () => {
  afterEach(cleanup);

  it("renders JSX through the Preact preset", () => {
    const { container } = render(<Hello name="world" />);
    expect(container.querySelector(".hello")?.textContent).toBe("Hello world");
  });
});
