import { signal } from "@preact/signals";

import { fetchNode } from "./api";
import type { Entry, Node } from "./api";
import { ancestorsOf, documentHrefForPath, documentPathFromLocation } from "./routing";

export type ViewState =
  | { status: "loading"; path: string }
  | { status: "loaded"; node: Node }
  | { status: "error"; path: string; error: unknown };

export interface FolderState {
  expanded: boolean;
  loading: boolean;
  entries?: Entry[];
  error?: boolean;
}

export const currentPath = signal<string>("");
export const view = signal<ViewState>({ status: "loading", path: "" });
export const tree = signal<Map<string, FolderState>>(new Map());

let requestSerial = 0;

export function withFolder(
  map: Map<string, FolderState>,
  path: string,
  patch: Partial<FolderState>,
): Map<string, FolderState> {
  const next = new Map(map);
  const previous = next.get(path) ?? { expanded: false, loading: false };
  next.set(path, { ...previous, ...patch });
  return next;
}

export async function loadPath(
  path: string,
  options: { push?: boolean } = {},
): Promise<void> {
  if (options.push && window.location.pathname !== documentHrefForPath(path)) {
    window.history.pushState(null, "", documentHrefForPath(path));
  }
  const serial = (requestSerial += 1);
  currentPath.value = path;
  view.value = { status: "loading", path };
  try {
    const node = await fetchNode(path);
    if (serial !== requestSerial) {
      return;
    }
    view.value = { status: "loaded", node };
  } catch (error) {
    if (serial !== requestSerial) {
      return;
    }
    view.value = { status: "error", path, error };
  }
}

export async function ensureFolder(path: string): Promise<void> {
  const current = tree.value.get(path);
  if (current?.entries || current?.loading) {
    return;
  }
  tree.value = withFolder(tree.value, path, { expanded: true, loading: true, error: false });
  try {
    const node = await fetchNode(path);
    const entries = node.kind === "directory" ? node.entries : [];
    tree.value = withFolder(tree.value, path, { loading: false, entries });
  } catch {
    tree.value = withFolder(tree.value, path, { loading: false, error: true });
  }
}

export function toggleFolder(path: string): void {
  const current = tree.value.get(path);
  if (current?.expanded) {
    tree.value = withFolder(tree.value, path, { expanded: false });
    return;
  }
  if (current?.entries) {
    tree.value = withFolder(tree.value, path, { expanded: true });
    return;
  }
  void ensureFolder(path);
}

export async function revealPath(path: string): Promise<void> {
  for (const ancestor of ancestorsOf(path)) {
    await ensureFolder(ancestor);
  }
}

export function navigate(path: string): void {
  void loadPath(path, { push: true });
  void revealPath(path);
}

export function initApp(): void {
  window.addEventListener("popstate", () => {
    void loadPath(documentPathFromLocation(window.location.pathname));
  });
  const path = documentPathFromLocation(window.location.pathname);
  void loadPath(path);
  void ensureFolder("");
  void revealPath(path);
}
