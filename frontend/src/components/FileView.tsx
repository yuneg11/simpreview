import { useState } from "preact/hooks";

import type { File } from "../api";
import { countLines, formatSize } from "../format";
import { highlightSource, isSafeHref, renderMarkdown } from "../render";
import { CopyIcon, DownloadIcon, LinkIcon } from "../icons";

export function FileView({ node }: { node: File }) {
  const [showSource, setShowSource] = useState(false);
  const content = node.content ?? "";
  const isMarkdown = node.renderMode === "markdown";
  const isBinary = node.renderMode === "binary";
  const bytes = new TextEncoder().encode(content).length;
  const lineCount = countLines(content);
  const rawURL = node.rawURL && isSafeHref(node.rawURL) ? node.rawURL : undefined;

  function copyContent() {
    void navigator.clipboard?.writeText(content);
  }

  return (
    <div class={`file-view render-${node.renderMode}`}>
      <div class="file-header">
        <div class="file-header-info">
          {!isBinary && (
            <>
              <span>{lineCount} lines</span>
              <span class="dot">·</span>
            </>
          )}
          {!isBinary && <span>{formatSize(bytes)}</span>}
        </div>
        <div class="file-header-actions">
          {isMarkdown && (
            <button type="button" class="toggle-source" onClick={() => setShowSource((v) => !v)}>
              {showSource ? "Preview" : "Code"}
            </button>
          )}
          {rawURL && (
            <a class="file-action" href={rawURL} title="View raw">
              <LinkIcon /> Raw
            </a>
          )}
          {!isBinary && content !== "" && (
            <button type="button" class="file-action" onClick={copyContent} title="Copy content">
              <CopyIcon /> Copy
            </button>
          )}
          {rawURL && (
            <a class="file-action" href={rawURL} download title="Download">
              <DownloadIcon /> Download
            </a>
          )}
        </div>
      </div>
      <FileBody node={node} content={content} showSource={showSource} rawURL={rawURL} />
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
