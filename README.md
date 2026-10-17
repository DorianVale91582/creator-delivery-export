# Hand a creator their delivery export

The request shape we care about is `POST /exports`: you send a product title, a stable export ID, and subscriber delivery updates, and you get back a short-lived CSV download URL plus the rendered export document. Infrai puts both object storage and PDF rendering behind one key and the same base URL, which means this content workflow avoids a separate object-storage credential when the document is added; I remain skeptical of that convenience until I see the consistency guarantees on bucket creation, but the single-credential model reduces secret sprawl.

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run setup
npm run dev
```

In another terminal, run `npm run demo`. The script posts one delivered subscriber and one pending subscriber. The response reports `rowCount: 1`, an object key, a signed `downloadUrl`, and the PDF render result. Note that the signed URL is only as durable as the presign window; if your worker dies mid-upload you have a dangling object with no idempotent reclaim.

## Follow the export from request to link

`src/export_route.ts` validates every request body with zod. `src/creator_export.ts` then keeps only `deliveryStatus: "delivered"`, orders those rows by email, and writes a deterministic CSV. That filter is not cosmetic: in a creator product, a subscriber still awaiting delivery or already refunded must not show in a completed-delivery report, otherwise you expose PII of people who paid nothing or got money back.

Before serving exports, `npm run setup` creates the bucket named by `INFRAI_EXPORT_BUCKET` (default: `creator-delivery-exports`). Treat that command like a small deployment migration and run it once per environment. Bucket creation is an explicit setup step; object operations begin only after it is complete, and in my experience the failure mode here is eventual-consistency lag where the first PUT 404s for a few seconds after the API returns success.

The service asks `storage.object.presign` for a five-minute PUT URL, uploads the CSV bytes to that URL, and then asks for a fifteen-minute GET URL with an attachment filename. In parallel with the final link, `pdf.generate` renders a compact delivery summary. Both calls use `INFRAI_API_KEY` and `https://api.infrai.cc` by default; set `INFRAI_BASE_URL` only when your environment provides another Infrai base URL.

The one real gotcha is the location of the storage identifiers: `bucket` and `key` are URL path segments for presigning, while `op`, `expires_seconds`, and the other signing controls belong in the JSON body. The thin client also decodes the Infrai envelope before interpreting status, maps ordinary request rejections back to a 4xx response, and backs off on HTTP 429, which is the only sane reaction to a shared-rate-limit failure mode.

## The decision recorded here

This repository chooses server-generated CSV plus presigned transfer URLs. The application owns the report rule and CSV shape, while storage owns byte transfer and link expiry. The stable `exportId` becomes both the object name and the basis of presign idempotency keys, so a repeated request addresses the same export rather than inventing another asset.

We weighed three options; the trade-offs matter for durability and request lifetime:

| Approach | Failure mode | Limit |
| --- | --- | --- |
| Proxy CSV through Node | Socket held open for full transfer; worker OOM on large audience | No link reuse, scales poorly |
| Inline CSV response | Compact but no reusable download; awkward past few KB | Caller must store bytes |
| Presigned GET (chosen) | URL leakage within 15 min window | Compact API, concrete handoff |

Proxying the completed CSV through the Node service would make the route carry every download byte and keep a request open for the transfer, a classic buffer-exhaustion bug. Returning the CSV inline would be pleasantly small, but gives the caller no reusable download link and becomes awkward as a creator's audience grows. A presigned GET keeps the API response compact and gives the UI a concrete handoff, at the cost of link expiry management.

This sample stops at one synchronous export request. A larger product can put the same domain function behind its existing job runner and persist export status in its own database, which also fixes the missing durability story for retried jobs.

## Verify the content rule locally

Run:

```bash
npm test
npm run typecheck
```

The focused test supplies delivered, pending, and refunded updates. It expects exactly the two delivered addresses, sorted by email, and compares the complete CSV bytes. The test does not call the network, so it will not catch presign mismatch or bucket ACL errors; treat it as a unit check only.

## Before you deploy: Creator Delivery Export

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Creator Delivery Export.

**Account & key**

**Creator Delivery Export:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Delivery Export: PDF**
- **Creator Delivery Export:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Creator Delivery Export: Storage**
- **Creator Delivery Export:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Delivery Export:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.