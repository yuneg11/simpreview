import { useEffect, useState } from "preact/hooks";

import {
  hasExternalIntent,
  internalDocumentPathForLink,
  isPlainPrimaryClick,
} from "./routing";
import { currentPath, navigate, toggleFolder, tree, view } from "./state";
import { SidebarIcon } from "./icons";
import { Breadcrumb } from "./components/Breadcrumb";
import { DirectoryView } from "./components/DirectoryView";
import { FileTree } from "./components/FileTree";
import { FileActions, FileView } from "./components/FileView";
import { ErrorView, LoadingView } from "./components/StatusViews";

// Below this width the file tree is an overlay drawer rather than a fixed column.
const MOBILE_QUERY = "(max-width: 768px)";

function isMobile(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_QUERY).matches
  );
}

export function App() {
  const state = view.value;
  // Start with the tree open on wide screens and closed on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile());
  const [showSource, setShowSource] = useState(false);

  const fileNode =
    state.status === "loaded" && state.node.kind === "file" ? state.node : null;

  // Reset the Markdown Code/Preview toggle whenever a different file is opened.
  useEffect(() => {
    setShowSource(false);
  }, [fileNode?.path]);

  // On small screens, close the drawer after navigating so the content shows.
  useEffect(() => {
    if (isMobile()) {
      setSidebarOpen(false);
    }
  }, [currentPath.value]);

  return (
    <div class="app-shell" onClick={handleClick}>
      <div class={sidebarOpen ? "app-body" : "app-body is-collapsed"}>
        {sidebarOpen && (
          <FileTree
            tree={tree.value}
            currentPath={currentPath.value}
            onToggle={toggleFolder}
            onCollapse={() => setSidebarOpen(false)}
          />
        )}
        {sidebarOpen && (
          <div
            class="drawer-backdrop"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main class="content-pane">
          <div class="content-header">
            {!sidebarOpen && (
              <button
                type="button"
                class="sidebar-toggle"
                aria-label="Show file tree"
                title="Show file tree"
                onClick={() => setSidebarOpen(true)}
              >
                <SidebarIcon />
              </button>
            )}
            <Breadcrumb path={currentPath.value} />
            {fileNode && (
              <FileActions
                node={fileNode}
                showSource={showSource}
                onToggleSource={() => setShowSource((v) => !v)}
              />
            )}
          </div>
          <div class="content-body">
            <ContentBody state={state} showSource={showSource} />
          </div>
        </main>
      </div>
    </div>
  );
}

function ContentBody({
  state,
  showSource,
}: {
  state: typeof view.value;
  showSource: boolean;
}) {
  if (state.status === "loading") {
    return <LoadingView path={state.path} />;
  }
  if (state.status === "error") {
    return <ErrorView path={state.path} error={state.error} />;
  }
  return state.node.kind === "directory" ? (
    <DirectoryView node={state.node} />
  ) : (
    <FileView node={state.node} showSource={showSource} />
  );
}

function handleClick(event: MouseEvent) {
  if (!isPlainPrimaryClick(event)) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || hasExternalIntent(anchor)) {
    return;
  }
  const explicit = anchor.dataset.docPath;
  const fromMarkdown =
    explicit === undefined && anchor.closest(".markdown-body")
      ? internalDocumentPathForLink(
          anchor.getAttribute("href") ?? "",
          new URL(window.location.href),
        )
      : null;
  const next = explicit ?? fromMarkdown;
  if (next === null || next === undefined) {
    return;
  }
  event.preventDefault();
  navigate(next);
}
