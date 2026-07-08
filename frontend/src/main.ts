import "./styles.css";

import { ApiError, fetchNode } from "./api";
import type {
  Directory,
  Entry,
  File as PreviewFile,
  Node as PreviewNode,
} from "./api";
import { renderNode } from "./render";

interface Breadcrumb {
  label: string;
  path: string;
}

interface BrowserElements {
  breadcrumbs: HTMLElement;
  status: HTMLElement;
  sidebarTitle: HTMLElement;
  sidebarMeta: HTMLElement;
  navigation: HTMLElement;
  entries: HTMLElement;
  previewTitle: HTMLElement;
  previewMeta: HTMLElement;
  previewActions: HTMLElement;
  notices: HTMLElement;
  previewContent: HTMLElement;
}

interface LoadOptions {
  pushHistory?: boolean;
}

export function documentPathFromLocation(pathname: string): string {
  const cleanPath = pathname.replace(/^\/+/, "");
  if (cleanPath === "") {
    return "";
  }

  return cleanPath.split("/").map(decodePathSegment).join("/");
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

class DocumentBrowser {
  private readonly elements: BrowserElements;
  private requestSerial = 0;

  constructor(private readonly app: HTMLDivElement) {
    this.app.innerHTML = browserShell();
    this.elements = collectElements(app);
    this.app.addEventListener("click", (event) => this.handleClick(event));
    window.addEventListener("popstate", () => {
      void this.loadCurrentLocation();
    });
  }

  start(): void {
    void this.loadCurrentLocation();
  }

  private async loadCurrentLocation(): Promise<void> {
    await this.loadPath(documentPathFromLocation(window.location.pathname));
  }

  private async navigateTo(path: string): Promise<void> {
    const cleanPath = normalizeDocumentPath(path);
    const href = documentHrefForPath(cleanPath);
    if (window.location.pathname !== href) {
      window.history.pushState(null, "", href);
    }
    await this.loadPath(cleanPath);
  }

  private async loadPath(path: string, options: LoadOptions = {}): Promise<void> {
    const cleanPath = normalizeDocumentPath(path);
    const currentRequest = this.requestSerial + 1;
    this.requestSerial = currentRequest;

    if (options.pushHistory) {
      window.history.pushState(null, "", documentHrefForPath(cleanPath));
    }

    this.renderLoading(cleanPath);

    try {
      const node = await fetchNode(cleanPath);
      if (currentRequest !== this.requestSerial) {
        return;
      }
      this.renderLoaded(node);
    } catch (error) {
      if (currentRequest !== this.requestSerial) {
        return;
      }
      this.renderError(cleanPath, error);
    }
  }

  private handleClick(event: MouseEvent): void {
    if (!isPlainPrimaryClick(event)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || !this.app.contains(anchor) || hasExternalIntent(anchor)) {
      return;
    }

    const explicitPath = anchor.dataset.docPath;
    const previewPath =
      explicitPath === undefined && this.elements.previewContent.contains(anchor)
        ? internalDocumentPathForLink(
            anchor.getAttribute("href") ?? "",
            new URL(window.location.href),
          )
        : null;
    const nextPath = explicitPath ?? previewPath;

    if (nextPath === null) {
      return;
    }

    event.preventDefault();
    void this.navigateTo(nextPath);
  }

  private renderLoading(path: string): void {
    this.renderBreadcrumbs(path);
    this.elements.status.textContent = `Loading ${displayDocumentPath(path)}`;
    this.elements.sidebarTitle.textContent = "Loading";
    this.elements.sidebarMeta.textContent = displayDocumentPath(path);
    this.renderNavigation(path);
    this.elements.entries.replaceChildren(compactMessage("Loading..."));
    this.elements.previewTitle.textContent = fileNameForPath(path) || "/";
    this.elements.previewMeta.textContent = "Fetching document data";
    this.elements.previewActions.replaceChildren();
    this.elements.notices.replaceChildren();
    this.elements.previewContent.className = "preview-content is-loading";
    this.elements.previewContent.replaceChildren(compactMessage("Loading..."));
  }

  private renderLoaded(node: PreviewNode): void {
    this.renderBreadcrumbs(node.path);
    this.renderNavigation(node.path);
    this.elements.notices.replaceChildren();

    if (node.kind === "directory") {
      this.renderDirectory(node);
      return;
    }

    this.renderFile(node);
  }

  private renderDirectory(node: Directory): void {
    const entryCount = node.entries.length;
    this.elements.status.textContent = `${entryCount} ${pluralize(
      entryCount,
      "entry",
      "entries",
    )} in ${displayDocumentPath(node.path)}`;
    this.elements.sidebarTitle.textContent = "Directory";
    this.elements.sidebarMeta.textContent = displayDocumentPath(node.path);
    this.elements.entries.replaceChildren(
      ...node.entries.map((entry) => entryLink(entry)),
    );

    if (node.entries.length === 0) {
      this.elements.entries.replaceChildren(compactMessage("Empty directory"));
    }

    if (node.truncated) {
      this.elements.notices.replaceChildren(
        notice("Directory listing truncated by the server limit."),
      );
    }

    this.elements.previewTitle.textContent = displayDocumentPath(node.path);
    this.elements.previewMeta.textContent = `Directory - ${entryCount} ${pluralize(
      entryCount,
      "entry",
      "entries",
    )}`;
    this.elements.previewActions.replaceChildren();
    this.elements.previewContent.className = "preview-content is-directory";
    this.elements.previewContent.innerHTML = renderNode(node);
  }

  private renderFile(node: PreviewFile): void {
    this.elements.status.textContent = `${node.renderMode} file loaded`;
    this.elements.sidebarTitle.textContent = "File";
    this.elements.sidebarMeta.textContent = displayDocumentPath(node.path);
    this.elements.entries.replaceChildren(fileDetails(node));
    this.elements.previewTitle.textContent = fileNameForPath(node.path);
    this.elements.previewMeta.textContent = fileMeta(node);
    this.elements.previewActions.replaceChildren();

    if (node.rawURL) {
      const rawLink = document.createElement("a");
      rawLink.className = "action-link";
      rawLink.href = node.rawURL;
      rawLink.textContent = "Open raw";
      this.elements.previewActions.append(rawLink);
    }

    this.elements.previewContent.className = `preview-content render-${node.renderMode}`;
    this.elements.previewContent.innerHTML = renderNode(node);
  }

  private renderError(path: string, error: unknown): void {
    const message = errorMessage(error);
    this.renderBreadcrumbs(path);
    this.renderNavigation(path);
    this.elements.status.textContent = `Error loading ${displayDocumentPath(path)}`;
    this.elements.sidebarTitle.textContent = "Error";
    this.elements.sidebarMeta.textContent = displayDocumentPath(path);
    this.elements.entries.replaceChildren(compactMessage(message));
    this.elements.previewTitle.textContent = `Could not open ${displayDocumentPath(
      path,
    )}`;
    this.elements.previewMeta.textContent = errorMeta(error);
    this.elements.previewActions.replaceChildren();
    this.elements.notices.replaceChildren();
    this.elements.previewContent.className = "preview-content is-error";
    this.elements.previewContent.replaceChildren(errorPanel(message));
  }

  private renderBreadcrumbs(path: string): void {
    const crumbs = breadcrumbsForPath(path);
    const nodes: HTMLElement[] = [];

    crumbs.forEach((crumb, index) => {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "/";
        nodes.push(separator);
      }

      const link = documentLink(crumb.path, crumb.label, "breadcrumb-link");
      if (index === crumbs.length - 1) {
        link.setAttribute("aria-current", "page");
      }
      nodes.push(link);
    });

    this.elements.breadcrumbs.replaceChildren(...nodes);
  }

  private renderNavigation(path: string): void {
    const links: HTMLElement[] = [];
    const parentPath = parentPathFor(path);

    if (normalizeDocumentPath(path) !== "") {
      links.push(documentLink("", "Root", "nav-button"));
    }

    if (parentPath !== null) {
      links.push(documentLink(parentPath, "Parent", "nav-button"));
    }

    this.elements.navigation.replaceChildren(...links);
  }
}

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  new DocumentBrowser(app).start();
}

function browserShell(): string {
  return `
    <div class="browser-shell">
      <header class="topbar">
        <div class="topbar-main">
          <div class="app-title">Web Preview</div>
          <nav class="breadcrumbs" aria-label="Path"></nav>
        </div>
        <div class="status" role="status" aria-live="polite"></div>
      </header>
      <main class="browser-layout">
        <aside class="sidebar" aria-label="Document navigation">
          <div class="sidebar-header">
            <div>
              <div class="sidebar-title"></div>
              <div class="sidebar-meta"></div>
            </div>
            <div class="nav-actions"></div>
          </div>
          <div class="entry-list"></div>
        </aside>
        <section class="preview-pane" aria-label="Document preview">
          <header class="preview-header">
            <div class="preview-heading">
              <h1 class="preview-title"></h1>
              <div class="preview-meta"></div>
            </div>
            <div class="preview-actions"></div>
          </header>
          <div class="notice-area"></div>
          <div class="preview-content"></div>
        </section>
      </main>
    </div>
  `;
}

function collectElements(root: HTMLElement): BrowserElements {
  return {
    breadcrumbs: requiredElement(root, ".breadcrumbs"),
    status: requiredElement(root, ".status"),
    sidebarTitle: requiredElement(root, ".sidebar-title"),
    sidebarMeta: requiredElement(root, ".sidebar-meta"),
    navigation: requiredElement(root, ".nav-actions"),
    entries: requiredElement(root, ".entry-list"),
    previewTitle: requiredElement(root, ".preview-title"),
    previewMeta: requiredElement(root, ".preview-meta"),
    previewActions: requiredElement(root, ".preview-actions"),
    notices: requiredElement(root, ".notice-area"),
    previewContent: requiredElement(root, ".preview-content"),
  };
}

function requiredElement<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing browser shell element: ${selector}`);
  }
  return element;
}

function normalizeDocumentPath(path: string): string {
  return path.replace(/^\/+/, "");
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function documentLink(
  path: string,
  label: string,
  className: string,
): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = className;
  link.href = documentHrefForPath(path);
  link.dataset.docPath = normalizeDocumentPath(path);
  link.textContent = label;
  return link;
}

function entryLink(entry: Entry): HTMLAnchorElement {
  const link = documentLink(entry.path, entry.name, `entry-row is-${entry.kind}`);

  const name = document.createElement("span");
  name.className = "entry-name";
  name.textContent = entry.name;

  const kind = document.createElement("span");
  kind.className = "entry-kind";
  kind.textContent = entryKindLabel(entry);

  const size = document.createElement("span");
  size.className = "entry-size";
  size.textContent = entry.kind === "directory" ? "--" : formatSize(entry.size);

  const modified = document.createElement("time");
  modified.className = "entry-modified";
  modified.dateTime = entry.modified;
  modified.textContent = formatModified(entry.modified);

  link.replaceChildren(name, kind, size, modified);
  return link;
}

function fileDetails(file: PreviewFile): HTMLElement {
  const details = document.createElement("dl");
  details.className = "detail-list";
  details.append(
    detail("Path", displayDocumentPath(file.path)),
    detail("Mode", file.renderMode),
    detail("MIME", file.mime || "unknown"),
  );
  if (file.rawURL) {
    const raw = document.createElement("a");
    raw.href = file.rawURL;
    raw.textContent = file.rawURL;
    details.append(detail("Raw", raw));
  }
  return details;
}

function detail(label: string, value: string | HTMLElement): HTMLElement {
  const group = document.createElement("div");
  group.className = "detail-row";

  const term = document.createElement("dt");
  term.textContent = label;

  const description = document.createElement("dd");
  if (typeof value === "string") {
    description.textContent = value;
  } else {
    description.append(value);
  }

  group.append(term, description);
  return group;
}

function compactMessage(message: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "compact-message";
  element.textContent = message;
  return element;
}

function notice(message: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "notice";
  element.textContent = message;
  return element;
}

function errorPanel(message: string): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "error-panel";
  const title = document.createElement("h2");
  title.textContent = "Unable to preview this path";
  const body = document.createElement("p");
  body.textContent = message;
  panel.append(title, body);
  return panel;
}

function entryKindLabel(entry: Entry): string {
  const base =
    entry.kind === "directory"
      ? "Directory"
      : entry.kind === "file"
        ? "File"
        : entry.kind === "symlink"
          ? "Symlink"
          : "Other";
  return entry.symlink && entry.kind !== "symlink" ? `${base} link` : base;
}

function fileMeta(file: PreviewFile): string {
  const mime = file.mime ? ` - ${file.mime}` : "";
  return `${file.renderMode}${mime}`;
}

function fileNameForPath(path: string): string {
  const cleanPath = normalizeDocumentPath(path);
  if (cleanPath === "") {
    return "/";
  }
  return cleanPath.split("/").at(-1) ?? cleanPath;
}

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "--";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatModified(modified: string): string {
  const date = new Date(modified);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

function errorMeta(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.status} - ${error.code}`;
  }
  return "Request failed";
}

function isPlainPrimaryClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function hasExternalIntent(anchor: HTMLAnchorElement): boolean {
  const target = anchor.getAttribute("target");
  return (
    anchor.hasAttribute("download") ||
    (target !== null && target !== "" && target !== "_self")
  );
}
