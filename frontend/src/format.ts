export function formatSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${Number(value.toFixed(digits))} ${units[unitIndex]}`;
}

export function formatModified(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function countLines(content: string): number {
  if (content === "") {
    return 0;
  }
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  return normalized.split("\n").length;
}
