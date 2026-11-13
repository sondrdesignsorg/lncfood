import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileMimeType } from "@/lib/file-types";

type Params = { id: string };

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^A-Za-z0-9._-]+/g, "_") || "resume";
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) {
    const current = new URL(request.url);
    const login = new URL("/admin/login", current);
    login.searchParams.set("callbackUrl", `${current.pathname}${current.search}`);
    return NextResponse.redirect(login);
  }

  const app = await prisma.application.findUnique({
    where: { id: params.id },
    select: {
      resumeUrl: true,
      resumeFilename: true,
      resumeMimeType: true,
    },
  });

  if (!app?.resumeUrl) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  let blob: Awaited<ReturnType<typeof get>>;
  try {
    blob = await get(app.resumeUrl, { access: "private", useCache: false });
  } catch (e) {
    console.error("[applications] resume blob fetch failed", {
      id: params.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Resume temporarily unavailable" }, { status: 502 });
  }
  if (!blob || blob.statusCode !== 200) {
    console.error("[applications] resume blob not found", {
      id: params.id,
      statusCode: blob?.statusCode ?? "null",
    });
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  const headers = new Headers();
  const contentType =
    app.resumeFilename || app.resumeMimeType
      ? resolveFileMimeType(app.resumeFilename ?? "", app.resumeMimeType)
      : blob.blob.contentType;
  headers.set("content-type", contentType || "application/octet-stream");
  headers.set("content-disposition", contentDisposition(app.resumeFilename ?? "resume"));
  if (blob.blob.size) {
    headers.set("content-length", String(blob.blob.size));
  }
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");

  return new Response(blob.stream, { headers });
}
