import { describe, expect, it, vi } from "vitest";

import { ApiError, fetchNode } from "./api";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("fetchNode URL mapping", () => {
  it.each([
    ["", "/-/api/fs/"],
    ["/", "/-/api/fs/"],
    ["docs/guide.md", "/-/api/fs/docs/guide.md"],
    ["/docs/guide.md", "/-/api/fs/docs/guide.md"],
    ["space dir/100%.md", "/-/api/fs/space%20dir/100%25.md"],
  ])("maps document path %j to %s", async (path, expectedURL) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({
          kind: "directory",
          path,
          canonicalPath: `/tmp/root/${path}`,
          entries: [],
          truncated: false,
        }),
      );

    await fetchNode(path, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(expectedURL);
  });

  it.each([
    "-",
    "-/api/fs",
    "/-",
    "/-/api/fs",
    "../secret.md",
    "docs/../secret.md",
    ".",
    "docs/./guide.md",
    "docs//guide.md",
    "docs/guide.md/",
    "docs\\guide.md",
    "bad\u0000name.md",
    "bad\u007fname.md",
  ])("rejects invalid document path %j before fetching", async (path) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchNode(path, fetchImpl)).rejects.toThrow(ApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchNode error handling", () => {
  it("throws an ApiError from a non-ok JSON error envelope", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "not_found", message: "path not found" } },
          { status: 404 },
        ),
      );

    await expect(fetchNode("missing.md", fetchImpl)).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "not_found",
      message: "path not found",
    });
  });

  it("returns file JSON for ok responses", async () => {
    const body = {
      kind: "file",
      path: "README.md",
      canonicalPath: "/tmp/root/README.md",
      mime: "text/markdown; charset=utf-8",
      renderMode: "markdown",
      content: "# README\n",
      rawURL: "/-/raw/README.md",
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(body));

    await expect(fetchNode("README.md", fetchImpl)).resolves.toEqual(body);
  });
});
