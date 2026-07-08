export type EntryKind = "directory" | "file" | "symlink" | "other";

export type RenderMode = "markdown" | "source" | "text" | "image" | "binary";

export interface Entry {
  name: string;
  path: string;
  kind: EntryKind;
  size: number;
  modified: string;
  symlink: boolean;
}

export interface Directory {
  kind: "directory";
  path: string;
  canonicalPath: string;
  entries: Entry[];
  truncated: boolean;
}

export interface File {
  kind: "file";
  path: string;
  canonicalPath: string;
  mime: string;
  renderMode: RenderMode;
  size: number;
  content?: string;
  rawURL?: string;
  tooLarge?: boolean;
}

export type Node = Directory | File;

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly envelope?: ApiErrorEnvelope;

  constructor(
    status: number,
    code: string,
    message: string,
    envelope?: ApiErrorEnvelope,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.envelope = envelope;
  }
}

export async function fetchNode(
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Node> {
  const response = await fetchImpl(apiURLForPath(path));
  const payload = await parseJSON(response);

  if (!response.ok) {
    throw apiErrorFromPayload(response.status, payload);
  }

  return payload as Node;
}

function apiURLForPath(path: string): string {
  const cleanPath = validateDocumentPath(path);
  if (cleanPath === "") {
    return "/-/api/fs/";
  }

  return `/-/api/fs/${cleanPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function validateDocumentPath(path: string): string {
  if (hasASCIIControl(path)) {
    throw invalidPath("path contains control characters");
  }
  if (path.includes("\\")) {
    throw invalidPath("path contains backslash");
  }

  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  if (cleanPath === "") {
    return cleanPath;
  }

  const segments = cleanPath.split("/");
  if (segments[0] === "-") {
    throw invalidPath("path uses reserved prefix");
  }

  for (const segment of segments) {
    if (segment === "") {
      throw invalidPath("path contains empty segment");
    }
    if (segment === "." || segment === "..") {
      throw invalidPath("path contains relative segment");
    }
  }

  return cleanPath;
}

function hasASCIIControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function invalidPath(message: string): ApiError {
  return new ApiError(400, "bad_request", message);
}

async function parseJSON(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function apiErrorFromPayload(status: number, payload: unknown): ApiError {
  if (isApiErrorEnvelope(payload)) {
    return new ApiError(
      status,
      payload.error.code,
      payload.error.message,
      payload,
    );
  }

  return new ApiError(status, "internal", `HTTP ${status}`);
}

function isApiErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  return typeof code === "string" && typeof message === "string";
}
