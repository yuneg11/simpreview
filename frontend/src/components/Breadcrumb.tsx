import { breadcrumbsForPath, documentHrefForPath } from "../routing";

export function Breadcrumb({ path }: { path: string }) {
  const crumbs = breadcrumbsForPath(path);
  const lead = crumbs.slice(0, -1);
  const current = crumbs[crumbs.length - 1];

  return (
    <nav class="breadcrumb" aria-label="Path">
      {/* Leading folders truncate with an ellipsis when space is tight; the
          current segment stays fully visible (GitHub-style). */}
      {lead.length > 0 && (
        <span class="breadcrumb-lead">
          {lead.map((crumb, index) => (
            <span class="breadcrumb-segment" key={crumb.path}>
              {index > 0 && <span class="breadcrumb-separator">/</span>}
              <a
                class="breadcrumb-link"
                href={documentHrefForPath(crumb.path)}
                data-doc-path={crumb.path}
              >
                {crumb.label}
              </a>
            </span>
          ))}
        </span>
      )}
      <span class="breadcrumb-current" key={current.path}>
        {lead.length > 0 && <span class="breadcrumb-separator">/</span>}
        <a
          class="breadcrumb-link is-current"
          href={documentHrefForPath(current.path)}
          data-doc-path={current.path}
          aria-current="page"
        >
          {current.label}
        </a>
      </span>
    </nav>
  );
}
