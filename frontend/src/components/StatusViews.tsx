import { ApiError } from "../api";
import { displayDocumentPath } from "../routing";

export function LoadingView({ path }: { path: string }) {
  return (
    <div class="status-view is-loading" role="status" aria-live="polite">
      Loading {displayDocumentPath(path)}…
    </div>
  );
}

export function ErrorView({ path, error }: { path: string; error: unknown }) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail =
    error instanceof ApiError ? `${error.status} · ${error.code}` : "Request failed";
  return (
    <div class="status-view is-error">
      <h2 class="status-title">Could not open {displayDocumentPath(path)}</h2>
      <p class="status-message">{message}</p>
      <p class="status-detail">{detail}</p>
    </div>
  );
}
