import {
  hasExternalIntent,
  internalDocumentPathForLink,
  isPlainPrimaryClick,
} from "./routing";
import { currentPath, navigate, toggleFolder, tree, view } from "./state";
import { Breadcrumb } from "./components/Breadcrumb";
import { DirectoryView } from "./components/DirectoryView";
import { FileTree } from "./components/FileTree";
import { FileView } from "./components/FileView";
import { ErrorView, LoadingView } from "./components/StatusViews";

export function App() {
  const state = view.value;
  return (
    <div class="app-shell" onClick={handleClick}>
      <header class="topbar">
        <span class="app-title">web-preview</span>
      </header>
      <div class="app-body">
        <FileTree tree={tree.value} currentPath={currentPath.value} onToggle={toggleFolder} />
        <main class="content-pane">
          <Breadcrumb path={currentPath.value} />
          <div class="content-body">
            <ContentBody state={state} />
          </div>
        </main>
      </div>
    </div>
  );
}

function ContentBody({ state }: { state: typeof view.value }) {
  if (state.status === "loading") {
    return <LoadingView path={state.path} />;
  }
  if (state.status === "error") {
    return <ErrorView path={state.path} error={state.error} />;
  }
  return state.node.kind === "directory" ? (
    <DirectoryView node={state.node} />
  ) : (
    <FileView node={state.node} />
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
