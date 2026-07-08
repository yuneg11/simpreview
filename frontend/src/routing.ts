export interface Breadcrumb {
  label: string;
  path: string;
}

function normalizeDocumentPath(path: string): string {
  return path.replace(/^\/+/, "");
}

export function documentPathFromLocation(pathname: string): string {
  return pathname
    .split("/")
    .filter((segment) => segment !== "")
    .map(decodePathSegment)
    .join("/");
}

export function displayDocumentPath(path: string): string {
  const cleanPath = normalizeDocumentPath(path);
  return cleanPath === "" ? "/" : `/${cleanPath}`;
}

export function breadcrumbsForPath(path: string): Breadcrumb[] {
  const cleanPath = normalizeDocumentPath(path);
  const breadcrumbs: Breadcrumb[] = [{ label: "root", path: "" }];
  if (cleanPath === "") {
    return breadcrumbs;
  }
  let currentPath = "";
  for (const segment of cleanPath.split("/")) {
    currentPath = currentPath === "" ? segment : `${currentPath}/${segment}`;
    breadcrumbs.push({ label: segment, path: currentPath });
  }
  return breadcrumbs;
}

export function parentPathFor(path: string): string | null {
  const cleanPath = normalizeDocumentPath(path);
  if (cleanPath === "") {
    return null;
  }
  const lastSlash = cleanPath.lastIndexOf("/");
  return lastSlash === -1 ? "" : cleanPath.slice(0, lastSlash);
}

export function documentHrefForPath(path: string): string {
  const cleanPath = normalizeDocumentPath(path);
  if (cleanPath === "") {
    return "/";
  }
  return `/${cleanPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function ancestorsOf(path: string): string[] {
  const cleanPath = normalizeDocumentPath(path);
  if (cleanPath === "") {
    return [];
  }
  const parts = cleanPath.split("/");
  const result: string[] = [""];
  let accumulated = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    accumulated = accumulated === "" ? parts[index] : `${accumulated}/${parts[index]}`;
    result.push(accumulated);
  }
  return result;
}

export function internalDocumentPathForLink(
  href: string,
  currentURL: URL,
): string | null {
  const trimmedHref = href.trim();
  if (trimmedHref === "" || trimmedHref.startsWith("#")) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmedHref, currentURL);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== currentURL.origin
  ) {
    return null;
  }
  if (parsed.pathname === currentURL.pathname && parsed.hash) {
    return null;
  }
  if (parsed.pathname === "/-" || parsed.pathname.startsWith("/-/")) {
    return null;
  }
  const documentPath = documentPathFromLocation(parsed.pathname);
  if (documentPath === "-" || documentPath.startsWith("-/")) {
    return null;
  }
  return documentPath;
}

export function isPlainPrimaryClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function hasExternalIntent(anchor: HTMLAnchorElement): boolean {
  const target = anchor.getAttribute("target");
  return (
    anchor.hasAttribute("download") ||
    (target !== null && target !== "" && target !== "_self")
  );
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
