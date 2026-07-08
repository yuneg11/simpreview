import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import MarkdownIt from "markdown-it";

import type { File as PreviewFile } from "./api";
import { countLines } from "./format";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdownLanguage);
hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, language) {
    return renderHighlightedBlock(code, language);
  },
});
// Let DOMPurify remove unsafe href/src values instead of rendering rejected
// Markdown links back as literal text that still includes the unsafe URL.
markdown.validateLink = () => true;

export function renderMarkdown(content: string): string {
  const rendered = markdown.render(content);
  return DOMPurify.sanitize(rendered);
}

export interface HighlightedSource {
  html: string;
  language?: string;
  lineCount: number;
}

export function highlightSource(content: string, file: PreviewFile): HighlightedSource {
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  const language = languageForFile(file);
  const highlighted = language ? highlightCode(normalized, language) : undefined;
  return {
    html: highlighted ?? escapeHTML(normalized),
    language: highlighted ? language : undefined,
    lineCount: countLines(content),
  };
}

function renderHighlightedBlock(code: string, language?: string): string {
  const normalizedLanguage = normalizeLanguage(language);
  const highlighted =
    normalizedLanguage && highlightCode(code, normalizedLanguage);

  if (highlighted) {
    return `<pre><code class="hljs language-${escapeAttribute(
      normalizedLanguage,
    )}">${highlighted}</code></pre>`;
  }

  return `<pre><code>${escapeHTML(code)}</code></pre>`;
}

function highlightCode(code: string, language: string): string | undefined {
  if (!hljs.getLanguage(language)) {
    return undefined;
  }

  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return undefined;
  }
}

function languageForFile(file: PreviewFile): string | undefined {
  const mimeLanguage = languageForMime(file.mime);
  if (mimeLanguage) {
    return mimeLanguage;
  }

  return languageForPath(file.path);
}

function languageForMime(mime: string): string | undefined {
  const contentType = mime.split(";")[0]?.trim().toLowerCase();
  if (!contentType) {
    return undefined;
  }

  const languageByMime: Record<string, string> = {
    "application/javascript": "javascript",
    "application/json": "json",
    "application/typescript": "typescript",
    "application/x-sh": "bash",
    "application/xml": "xml",
    "text/css": "css",
    "text/html": "xml",
    "text/javascript": "javascript",
    "text/jsx": "javascript",
    "text/markdown": "markdown",
    "text/typescript": "typescript",
    "text/x-python": "python",
    "text/x-shellscript": "bash",
    "text/xml": "xml",
    "text/yaml": "yaml",
  };

  return languageByMime[contentType];
}

function languageForPath(path: string): string | undefined {
  const lowerPath = path.toLowerCase();
  const extension =
    lowerPath.endsWith(".d.ts") || lowerPath.endsWith(".d.tsx")
      ? "ts"
      : lowerPath.split(".").pop();

  if (!extension || extension === lowerPath) {
    return undefined;
  }

  const languageByExtension: Record<string, string> = {
    bash: "bash",
    c: "c",
    cc: "cpp",
    cjs: "javascript",
    cpp: "cpp",
    css: "css",
    cxx: "cpp",
    go: "go",
    h: "c",
    hpp: "cpp",
    htm: "xml",
    html: "xml",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    kt: "kotlin",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    svg: "xml",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };

  return normalizeLanguage(languageByExtension[extension]);
}

function normalizeLanguage(language?: string): string | undefined {
  if (!language) {
    return undefined;
  }

  const cleanLanguage = language
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_+-]/g, "");
  if (!cleanLanguage) {
    return undefined;
  }

  const aliases: Record<string, string> = {
    js: "javascript",
    md: "markdown",
    shell: "bash",
    ts: "typescript",
  };

  const normalized = aliases[cleanLanguage] ?? cleanLanguage;
  return hljs.getLanguage(normalized) ? normalized : undefined;
}

export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("#")) {
    return true;
  }

  if (trimmed.startsWith("/")) {
    // Reject protocol-relative ("//host") and the "/\host" variant, which
    // browsers may normalize to "//host" (an external, protocol-relative URL).
    return !trimmed.startsWith("//") && !trimmed.startsWith("/\\");
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHTML(value);
}
