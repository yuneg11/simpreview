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
  const isBinary = node.renderMode === "binary";
  const bytes = new TextEncoder().encode(content).length;
  const lineCount = countLines(content);
  const rawURL = safeRawURL(node);

  function copyContent() {
    void navigator.clipboard?.writeText(content);
  }

  return (
    <div class="file-actions">
      {!isBinary && (
        <span class="file-meta">
          {lineCount} lines <span class="dot">·</span> {formatSize(bytes)}
        </span>
      )}
      {isMarkdown && (
        <button type="button" class="toggle-source" onClick={onToggleSource}>
          {showSource ? "Preview" : "Code"}
        </button>
      )}
      {rawURL && (
        <a class="file-action" href={rawURL} title="View raw">
          Raw
        </a>
      )}
      {!isBinary && content !== "" && (
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
  return (
    <div class={`file-view render-${node.renderMode}`}>
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
  if (node.renderMode === "markdown" && !showSource) {
    return <article class="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
  }
  if (node.renderMode === "binary") {
    return <BinaryView node={node} rawURL={rawURL} />;
  }
  return <CodeView content={content} file={node} />;
}

function CodeView({ content, file }: { content: string; file: File }) {
  const { html, language, lineCount } = highlightSource(content, file);
  const numbers = Array.from({ length: Math.max(lineCount, 1) }, (_unused, index) => index + 1);
  return (
    <div class="code-view">
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
  );
}

function BinaryView({ node, rawURL }: { node: File; rawURL?: string }) {
  const isImage = node.mime.startsWith("image/");
  if (isImage && rawURL) {
    return (
      <div class="binary-view">
        <img src={rawURL} alt={node.path} />
      </div>
    );
  }
  return (
    <div class="binary-view">
      <p>Binary file — preview is not available.</p>
      {rawURL && (
        <a class="file-action" href={rawURL} download>
          <DownloadIcon /> Download
        </a>
      )}
    </div>
  );
}
