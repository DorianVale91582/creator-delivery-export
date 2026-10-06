import assert from "node:assert/strict";
import test from "node:test";
import { buildDeliveryCsv, deliveredSubscribers } from "../src/creator_export.ts";
import type { ExportRequest } from "../src/export_contract.ts";

const request: ExportRequest = {
  creatorId: "creator_42",
  exportId: "8d55e87e-1558-4614-a7b4-bc88d8f10c23",
  productTitle: "Studio Lighting Workbook",
  subscribers: [
    { email: "zoe@example.com", deliveryStatus: "delivered", updatedAt: "2026-09-21T09:00:00.000Z" },
    { email: "amy@example.com", deliveryStatus: "delivered", updatedAt: "2026-09-21T08:00:00.000Z" },
    { email: "pat@example.com", deliveryStatus: "pending", updatedAt: "2026-09-21T07:00:00.000Z" },
    { email: "lee@example.com", deliveryStatus: "refunded", updatedAt: "2026-09-21T06:00:00.000Z" },
  ],
};

test("exports only delivered subscribers in stable email order", () => {
  assert.deepEqual(
    deliveredSubscribers(request).map(({ email }) => email),
    ["amy@example.com", "zoe@example.com"],
  );
  assert.equal(
    buildDeliveryCsv(request),
    "email,delivery_status,updated_at\n" +
      '"amy@example.com","delivered","2026-09-21T08:00:00.000Z"\n' +
      '"zoe@example.com","delivered","2026-09-21T09:00:00.000Z"\n',
  );
});
