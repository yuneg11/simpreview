import type { Directory } from "../api";
import { documentHrefForPath } from "../routing";
import { formatModified, formatSize } from "../format";
import { FileIcon, FolderIcon } from "../icons";

export function DirectoryView({ node }: { node: Directory }) {
  return (
    <div class="dir-view">
      {node.truncated && (
        <div class="notice">Directory listing truncated by the server limit.</div>
      )}
      {node.entries.length === 0 ? (
        <div class="dir-empty">This directory is empty.</div>
      ) : (
        <table class="dir-table">
          <tbody>
            {node.entries.map((entry) => (
              <tr class="dir-row" key={entry.path}>
                <td class="dir-cell-icon">
                  {entry.kind === "directory" ? (
                    <FolderIcon class="dir-icon is-dir" />
                  ) : (
                    <FileIcon class="dir-icon" />
                  )}
                </td>
                <td class="dir-cell-name">
                  <a
                    class="dir-link"
                    href={documentHrefForPath(entry.path)}
                    data-doc-path={entry.path}
                  >
                    {entry.name}
                  </a>
                </td>
                <td class="dir-cell-size">
                  {entry.kind === "directory" ? "" : formatSize(entry.size)}
                </td>
                <td class="dir-cell-modified">{formatModified(entry.modified)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
