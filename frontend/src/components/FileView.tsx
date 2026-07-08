import type { File } from "../api";
import { countLines, formatSize } from "../format";
import { highlightSource, isSafeHref, renderMarkdown } from "../render";
import { CopyIcon, DownloadIcon } from "../icons";

function safeRawURL(node: File): string | undefined {
  return node.rawURL && isSafeHref(node.rawURL) ? node.rawURL : undefined;
}

function hasSource(node: File): boolean {
  return (node.content ?? "") !== "";
}

// Markdown and SVG have both a rendered preview and a text source, so they get
// a Code/Preview toggle. (SVG arrives as renderMode "image" with content.)
function hasPreviewToggle(node: File): boolean {
  return (
    node.renderMode === "markdown" ||
    (node.renderMode === "image" && hasSource(node))
  );
}

// Whether the body currently shows the source (code) view rather than a
// rendered preview / image / download panel.
function showsCode(node: File, showSource: boolean): boolean {
  if (node.tooLarge || node.renderMode === "binary") {
    return false;
  }
  if (node.renderMode === "image") {
    return hasPreviewToggle(node) && showSource;
  }
  if (node.renderMode === "markdown") {
    return showSource;
  }
  return true; // source / text
}

/**
 * Right side of the merged header row for a file: line count + size, plus the
 * Code/Preview toggle (Markdown/SVG) and Raw / Copy / Download actions. Lives in
 * the header row above the content, not inside it.
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
  const rawURL = safeRawURL(node);

  function copyContent() {
    void navigator.clipboard?.writeText(content);
  }

  return (
    <div class="file-actions">
      <span class="file-meta">
        {hasSource(node) && (
          <>
            {countLines(content)} lines <span class="dot">·</span>{" "}
          </>
        )}
        {formatSize(node.size)}
      </span>
      {hasPreviewToggle(node) && (
        <button type="button" class="toggle-source" onClick={onToggleSource}>
          {showSource ? "Preview" : "Code"}
        </button>
      )}
      {rawURL && (
        <a class="file-action" href={rawURL} title="View raw">
          Raw
        </a>
      )}
      {hasSource(node) && (
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
  // scrollbar stays pinned to the bottom of the viewport. Other views (image /
  // download / markdown) are normal-flow blocks.
  const isCode = showsCode(node, showSource);
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
  if (showsCode(node, showSource)) {
    return <CodeView content={content} file={node} />;
  }
  if (node.renderMode === "image") {
    return <ImageView node={node} rawURL={rawURL} />;
  }
  return <article class="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
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
 * Inline image preview. The bytes come from the raw endpoint via <img>, so the
 * browser decodes them natively and no content is inlined in the JSON.
 */
function ImageView({ node, rawURL }: { node: File; rawURL?: string }) {
  if (!rawURL) {
    return <DownloadPanel message="This image can't be displayed." rawURL={rawURL} />;
  }
  return (
    <div class="image-view">
      <img src={rawURL} alt={node.path} />
    </div>
  );
}

/**
 * Download-only panel for files that are never previewed inline: non-image
 * binary files and files too large to preview.
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
