import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { head, list } from "@vercel/blob";
import { resolveFileMimeType } from "../src/lib/file-types";

const prisma = new PrismaClient();

type Row = {
  id: string;
  createdAt: Date;
  owner: string;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  url: string;
};

async function checkRow(row: Row) {
  try {
    const blob = await head(row.url);
    const expectedMime = resolveFileMimeType(row.filename ?? "", row.mimeType);
    const warnings: string[] = [];
    if (row.size && blob.size !== row.size) {
      warnings.push(`size db=${row.size} blob=${blob.size}`);
    }
    if (row.mimeType && expectedMime !== row.mimeType) {
      warnings.push(`mime db=${row.mimeType} resolved=${expectedMime}`);
    }
    if (blob.contentType && expectedMime !== blob.contentType) {
      warnings.push(`mime resolved=${expectedMime} blob=${blob.contentType}`);
    }
    return { ok: true, warnings };
  } catch (e) {
    return { ok: false, warnings: [e instanceof Error ? e.message : String(e)] };
  }
}

async function main() {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      resumeUrl: true,
      resumeFilename: true,
      resumeMimeType: true,
      resumeSize: true,
    },
  });

  const partnerApplications = await prisma.partnerApplication.findMany({
    where: { productCatalogUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      businessName: true,
      productCatalogUrl: true,
      productCatalogFilename: true,
      productCatalogMimeType: true,
      productCatalogSize: true,
    },
  });

  const resumeRows: Row[] = applications
    .filter((a) => a.resumeUrl)
    .map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      owner: `${a.firstName} ${a.lastName}`,
      filename: a.resumeFilename,
      mimeType: a.resumeMimeType,
      size: a.resumeSize,
      url: a.resumeUrl!,
    }));

  const catalogRows: Row[] = partnerApplications.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    owner: a.businessName,
    filename: a.productCatalogFilename,
    mimeType: a.productCatalogMimeType,
    size: a.productCatalogSize,
    url: a.productCatalogUrl!,
  }));

  const missingResumes = applications.filter((a) => !a.resumeUrl);

  console.log(`Applications: ${applications.length} (${resumeRows.length} with resume)`);
  console.log(`Partner catalogs: ${catalogRows.length}`);
  if (missingResumes.length) {
    console.log(`\nApplications without a resume (${missingResumes.length}):`);
    for (const a of missingResumes) {
      console.log(`  ${a.createdAt.toISOString()}  ${a.firstName} ${a.lastName}  ${a.id}`);
    }
  }

  let failures = 0;
  for (const [label, rows] of [
    ["RESUME", resumeRows],
    ["CATALOG", catalogRows],
  ] as const) {
    console.log(`\nChecking ${rows.length} ${label.toLowerCase()}(s)...`);
    for (const row of rows) {
      const result = await checkRow(row);
      if (!result.ok) {
        failures++;
        console.log(
          `FAIL ${label} ${row.createdAt.toISOString()} ${row.owner} | ${row.filename} | ${row.id}`,
        );
        for (const warning of result.warnings) console.log(`     ${warning}`);
      } else if (result.warnings.length) {
        console.log(
          `WARN ${label} ${row.createdAt.toISOString()} ${row.owner} | ${row.filename} | ${row.id}`,
        );
        for (const warning of result.warnings) console.log(`     ${warning}`);
      }
    }
  }

  for (const [label, prefix, rows] of [
    ["resume", "resumes/", resumeRows],
    ["catalog", "catalogs/", catalogRows],
  ] as const) {
    const known = new Set(rows.map((row) => row.url));
    const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 100 });
      blobs.push(...page.blobs);
      cursor = page.cursor;
    } while (cursor);

    const orphans = blobs.filter((blob) => !known.has(blob.url));
    if (orphans.length) {
      console.log(`\nWARN ${orphans.length} orphaned ${label} blob(s) not linked to any record:`);
      for (const blob of orphans) {
        console.log(`  ${blob.uploadedAt.toISOString()}  ${blob.size}B  ${blob.pathname}`);
      }
    }
  }

  console.log(failures ? `\n${failures} inaccessible file(s) found.` : "\nAll uploaded files are accessible.");
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
