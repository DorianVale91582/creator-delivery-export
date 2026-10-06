import type { ExportRequest } from "./export_contract.ts";
import { infrai } from "./infrai.ts";

const EXPORT_BUCKET = process.env.INFRAI_EXPORT_BUCKET ?? "creator-delivery-exports";

export function deliveredSubscribers(input: ExportRequest): ExportRequest["subscribers"] {
  return input.subscribers
    .filter((subscriber) => subscriber.deliveryStatus === "delivered")
    .sort((left, right) => left.email.localeCompare(right.email));
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildDeliveryCsv(input: ExportRequest): string {
  const rows = deliveredSubscribers(input).map((subscriber) =>
    [subscriber.email, subscriber.deliveryStatus, subscriber.updatedAt]
      .map(csvCell)
      .join(","),
  );
  return ["email,delivery_status,updated_at", ...rows].join("\n") + "\n";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function exportSummaryHtml(input: ExportRequest, rowCount: number): string {
  return `<!doctype html><html><body><h1>${escapeHtml(input.productTitle)}</h1><p>Delivery export ${escapeHtml(input.exportId)}</p><p>${rowCount} delivered subscribers</p></body></html>`;
}

export async function createCreatorExport(input: ExportRequest): Promise<{
  downloadUrl: string;
  objectKey: string;
  rowCount: number;
  document: unknown;
}> {
  const subscribers = deliveredSubscribers(input);
  const csv = buildDeliveryCsv(input);
  const objectKey = `${input.creatorId}/${input.exportId}.csv`;
  const requestKey = `creator-export:${input.exportId}`;

  const upload = await infrai.storage.object.presign(EXPORT_BUCKET, objectKey, {
    op: "put",
    expires_seconds: 300,
    content_type: "text/csv; charset=utf-8",
    idempotency_key: `${requestKey}:put`,
  });
  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/csv; charset=utf-8" },
    body: csv,
  });
  if (!uploadResponse.ok) throw new Error(`CSV upload was rejected (${uploadResponse.status}).`);

  const [download, document] = await Promise.all([
    infrai.storage.object.presign(EXPORT_BUCKET, objectKey, {
      op: "get",
      expires_seconds: 900,
      response_disposition: `attachment; filename="${input.exportId}.csv"`,
      idempotency_key: `${requestKey}:get`,
    }),
    infrai.pdf.generate({
      html: exportSummaryHtml(input, subscribers.length),
      page_size: "A4",
      orientation: "portrait",
      store: false,
    }),
  ]);

  return { downloadUrl: download.url, objectKey, rowCount: subscribers.length, document };
}
