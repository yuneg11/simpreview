import type { Entry } from "../api";
import type { FolderState } from "../state";
import { documentHrefForPath } from "../routing";
import { ChevronIcon, FileIcon, FolderIcon, SidebarIcon } from "../icons";

interface TreeProps {
  tree: Map<string, FolderState>;
  currentPath: string;
  onToggle: (path: string) => void;
}

export function FileTree({
  tree,
  currentPath,
  onToggle,
  onCollapse,
}: TreeProps & { onCollapse?: () => void }) {
  return (
    <aside class="file-tree" aria-label="Files">
      <div class="file-tree-header">
        <span>Files</span>
        {onCollapse && (
          <button
            type="button"
            class="sidebar-toggle"
            aria-label="Hide file tree"
            title="Hide file tree"
            onClick={onCollapse}
          >
            <SidebarIcon />
          </button>
        )}
      </div>
      <nav class="file-tree-body">
        <TreeLevel parentPath="" depth={0} tree={tree} currentPath={currentPath} onToggle={onToggle} />
      </nav>
    </aside>
  );
}

function TreeLevel({
  parentPath,
  depth,
  tree,
  currentPath,
  onToggle,
}: TreeProps & { parentPath: string; depth: number }) {
  const folder = tree.get(parentPath);
  if (!folder?.entries) {
    return folder?.loading ? <div class="tree-loading" style={indent(depth)}>Loading…</div> : null;
  }
  return (
    <ul class="tree-list">
      {folder.entries.map((entry) =>
        entry.kind === "directory" ? (
          <TreeFolder
            key={entry.path}
            entry={entry}
            depth={depth}
            tree={tree}
            currentPath={currentPath}
            onToggle={onToggle}
          />
        ) : (
          <TreeFile key={entry.path} entry={entry} depth={depth} currentPath={currentPath} />
        ),
      )}
    </ul>
  );
}

function TreeFolder({
  entry,
  depth,
  tree,
  currentPath,
  onToggle,
}: TreeProps & { entry: Entry; depth: number }) {
  const state = tree.get(entry.path);
  const expanded = state?.expanded ?? false;
  return (
    <li class="tree-folder">
      <button
        type="button"
        class="tree-folder-row"
        style={indent(depth)}
        aria-expanded={expanded}
        onClick={() => onToggle(entry.path)}
      >
        <ChevronIcon class={expanded ? "tree-chevron is-open" : "tree-chevron"} />
        <FolderIcon class="tree-icon" />
        <span class="tree-label">{entry.name}</span>
      </button>
      {expanded && (
        <TreeLevel
          parentPath={entry.path}
          depth={depth + 1}
          tree={tree}
          currentPath={currentPath}
          onToggle={onToggle}
        />
      )}
    </li>
  );
}

function TreeFile({
  entry,
  depth,
  currentPath,
}: {
  entry: Entry;
  depth: number;
  currentPath: string;
}) {
  const active = entry.path === currentPath;
  return (
    <li>
      <a
        class={active ? "tree-file is-active" : "tree-file"}
        style={indent(depth)}
        href={documentHrefForPath(entry.path)}
        data-doc-path={entry.path}
        aria-current={active ? "page" : undefined}
      >
        <span class="tree-spacer" aria-hidden="true" />
        <FileIcon class="tree-icon" />
        <span class="tree-label">{entry.name}</span>
      </a>
    </li>
  );
}

function indent(depth: number) {
  return { paddingLeft: `${8 + depth * 16}px` };
}
