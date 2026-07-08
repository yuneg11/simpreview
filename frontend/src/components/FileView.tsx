import type { File } from "../api";
import { countLines, formatSize } from "../format";
import { highlightSource, isSafeHref, renderMarkdown } from "../render";
import { CopyIcon, DownloadIcon } from "../icons";

function safeRawURL(node: File): string | undefined {
  return node.rawURL && isSafeHref(node.rawURL) ? node.rawURL : undefined;
}

/**
 * Right side of the merged header row for a file: line count + size, plus the
 * Code/Preview toggle (Markdown only) and Raw / Copy / Download actions. Lives
 * in the header row above the content card, not inside it.
 */
export function FileActions({
  node,
  showSource,
  onToggleSource,
}: {
  node: File;
  showSource: boolean;
  onToggleSource: () => void;
}) {
  const content = node.content ?? "";
  const isMarkdown = node.renderMode === "markdown";
  // Binary and too-large files have no inline content: show only the size and
  // the download actions, never line count / Copy / the Code toggle.
  const previewable = !node.tooLarge && node.renderMode !== "binary";
  const rawURL = safeRawURL(node);

  function copyContent() {
    void navigator.clipboard?.writeText(content);
  }

  return (
    <div class="file-actions">
      <span class="file-meta">
        {previewable && (
          <>
            {countLines(content)} lines <span class="dot">·</span>{" "}
          </>
        )}
        {formatSize(node.size)}
      </span>
      {previewable && isMarkdown && (
        <button type="button" class="toggle-source" onClick={onToggleSource}>
          {showSource ? "Preview" : "Code"}
        </button>
      )}
      {rawURL && (
        <a class="file-action" href={rawURL} title="View raw">
          Raw
        </a>
      )}
      {previewable && content !== "" && (
        <button
          type="button"
          class="file-action file-action-icon"
          onClick={copyContent}
          title="Copy"
          aria-label="Copy file contents"
        >
          <CopyIcon />
        </button>
      )}
      {rawURL && (
        <a
          class="file-action file-action-icon"
          href={rawURL}
          download
          title="Download"
          aria-label="Download file"
        >
          <DownloadIcon />
        </a>
      )}
    </div>
  );
}

export function FileView({ node, showSource }: { node: File; showSource: boolean }) {
  // A code display (line-number gutter) fills the full content area and scrolls
  // internally, so the gutter divider reaches the bottom and the horizontal
  // scrollbar stays pinned to the bottom of the viewport. Binary and too-large
  // files render a download panel instead, so they are not "code".
  const isCode =
    !node.tooLarge &&
    (node.renderMode === "source" ||
      node.renderMode === "text" ||
      (node.renderMode === "markdown" && showSource));
  return (
    <div class={`file-view render-${node.renderMode}${isCode ? " is-code" : ""}`}>
      <FileBody
        node={node}
        content={node.content ?? ""}
        showSource={showSource}
        rawURL={safeRawURL(node)}
      />
    </div>
  );
}

function FileBody({
  node,
  content,
  showSource,
  rawURL,
}: {
  node: File;
  content: string;
  showSource: boolean;
  rawURL?: string;
}) {
  if (node.tooLarge) {
    return <DownloadPanel message="This file is too large to preview." rawURL={rawURL} />;
  }
  if (node.renderMode === "binary") {
    return (
      <DownloadPanel
        message="This is a binary file and can't be previewed."
        rawURL={rawURL}
      />
    );
  }
  if (node.renderMode === "markdown" && !showSource) {
    return <article class="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
  }
  return <CodeView content={content} file={node} />;
}

function CodeView({ content, file }: { content: string; file: File }) {
  const { html, language, lineCount } = highlightSource(content, file);
  const numbers = Array.from({ length: Math.max(lineCount, 1) }, (_unused, index) => index + 1);
  return (
    <div class="code-view">
      <div class="code-inner">
        <div class="code-gutter" aria-hidden="true">
          {numbers.map((n) => (
            <span class="code-line-no" key={n}>
              {n}
            </span>
          ))}
        </div>
        <pre class="code-body">
          <code
            class={language ? `hljs language-${language}` : "hljs"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
      </div>
    </div>
  );
}

/**
 * Download-only panel for files that are never previewed inline: binary files
 * (any type, including images) and files too large to preview.
 */
function DownloadPanel({ message, rawURL }: { message: string; rawURL?: string }) {
  return (
    <div class="binary-view">
      <p>{message}</p>
      {rawURL && (
        <a class="file-action" href={rawURL} download>
          <DownloadIcon /> Download
        </a>
      )}
    </div>
  );
}
