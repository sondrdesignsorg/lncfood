const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

const MIME_ALIASES: Record<string, string> = {
  "application/x-pdf": "application/pdf",
  "application/acrobat": "application/pdf",
  "applications/vnd.pdf": "application/pdf",
  "text/pdf": "application/pdf",
  "text/x-pdf": "application/pdf",
  "application/x-msword": "application/msword",
  "application/vnd.ms-word": "application/msword",
  "application/doc": "application/msword",
  "application/docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-xls": "application/vnd.ms-excel",
  "application/xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/comma-separated-values": "text/csv",
};

const GENERIC_MIME = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.split(/[\\/]/).pop() ?? "");
  return match ? match[1].toLowerCase() : "";
}

export function extensionMimeType(name: string): string | null {
  return MIME_BY_EXTENSION[fileExtension(name)] ?? null;
}

export function resolveFileMimeType(name: string, reported: string | null | undefined): string {
  const type = (reported ?? "").split(";")[0].trim().toLowerCase();
  if (type && !GENERIC_MIME.has(type)) {
    return MIME_ALIASES[type] ?? type;
  }
  return extensionMimeType(name) ?? (type || "application/octet-stream");
}
