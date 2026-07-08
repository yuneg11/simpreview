import { breadcrumbsForPath, displayDocumentPath, documentHrefForPath } from "../routing";
import { CopyIcon } from "../icons";

export function Breadcrumb({ path }: { path: string }) {
  const crumbs = breadcrumbsForPath(path);

  function copyPath() {
    void navigator.clipboard?.writeText(displayDocumentPath(path));
  }

  return (
    <nav class="breadcrumb" aria-label="Path">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span class="breadcrumb-segment" key={crumb.path}>
            {index > 0 && <span class="breadcrumb-separator">/</span>}
            <a
              class={isLast ? "breadcrumb-link is-current" : "breadcrumb-link"}
              href={documentHrefForPath(crumb.path)}
              data-doc-path={crumb.path}
              aria-current={isLast ? "page" : undefined}
            >
              {crumb.label}
            </a>
          </span>
        );
      })}
      <button type="button" class="copy-path" title="Copy path" onClick={copyPath}>
        <CopyIcon />
      </button>
    </nav>
  );
}
