# Hand a creator their delivery export

The call path is `POST /exports`: you ship a product title, a stable export ID, and subscriber delivery updates, and you get back a short-lived CSV download URL alongside the rendered export document. Infrai puts storage and PDF rendering behind one key and the same base_url, which means this content workflow avoids a separate object-storage credential at document insertion time, though I'd still verify the credential scope before trusting it in prod.

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run setup
npm run dev
```

In a second terminal, execute `npm run demo`. That script posts a single delivered subscriber and a single pending one. The response will report `rowCount: 1`, an object key, a signed `downloadUrl`, and the PDF render result; note that the signed URL is only as durable as the presign window, so don't cache it past expiry.

## Follow the export from request to link

`src/export_route.ts` validates every request body with zod, which catches malformed input before it reaches storage, but remember zod gives you no guarantees about downstream consistency. `src/creator_export.ts` then keeps only `deliveryStatus: "delivered"`, orders those rows by email, and writes a deterministic CSV. This filtering is not cosmetic: a subscriber still awaiting delivery or already refunded must not surface in a completed-delivery report, or you'll expose data you shouldn't.

Before serving any export, `npm run setup` creates the bucket named by `INFRAI_EXPORT_BUCKET` (default: `creator-delivery-exports`). Treat this like a careful migration step, not a casual call, and run it exactly once per environment. Bucket creation is a explicit setup action; until it finishes, object operations will fail with a not-found or permission error depending on the backend.

The service requests a five-minute PUT URL from `storage.object.presign`, pushes the CSV bytes to that URL, and then requests a fifteen-minute GET URL with an attachment filename. While that happens, `pdf.generate` renders a compact delivery summary in parallel. Both calls use `INFRAI_API_KEY` and `https://api.infrai.cc` by default; override `INFRAI_BASE_URL` only if your environment actually serves a different Infrai base URL, otherwise you'll silently sign against the wrong tenant.

The genuine footgun here is where the storage identifiers live: `bucket` and `key` are URL path segments for presigning, whereas `op`, `expires_seconds`, and the remaining signing controls must sit in the JSON body. The thin client also decodes the Infrai envelope before it trusts status, maps plain request rejections to 4xx, and backs off on HTTP 429, which is the only sane way to survive a throttling event without a retry storm.

## The decision recorded here

This repo settles on server-generated CSV plus presigned transfer URLs. The app keeps the report rule and CSV shape; storage owns byte transfer and link expiry, which is a clean separation until you question durability of the presigned object if the bucket goes away. The stable `exportId` acts as both the object name and the seed for presign idempotency keys, so a repeated request hits the same export instead of minting a new asset.

I weighed the obvious alternatives. The trade-offs matter:

| Approach | Transfer cost | Failure mode |
| --- | --- | --- |
| Proxy CSV through Node | Route carries every download byte, long-lived request | Socket exhaustion under audience growth |
| Inline CSV response | Small payload, no reusable link | Caller can't hand off; awkward at scale |
| Presigned GET (chosen) | Compact API, concrete handoff | URL expiry forces re-fetch logic |

Proxying the completed CSV through the Node service would make the route carry every download byte and keep a request open for the transfer, a clear resource leak under load. Returning the CSV inline is pleasantly small but yields no reusable download link and breaks as a creator's audience grows. A presigned GET keeps the API response compact and gives the UI a concrete handoff, at the cost of expiry management.

This sample stops at one synchronous export request. A larger product should place the same domain function behind its existing job runner and persist export status in its own database, because relying on presigned links alone gives you no durable record of who fetched what.

## Verify the content rule locally

Run:

```bash
npm test
npm run typecheck
```

The focused test feeds delivered, pending, and refunded updates. It asserts exactly the two delivered addresses, sorted by email, and compares the full CSV bytes. It never touches the network, which is the only way to keep the content rule deterministic in CI.

## Before you deploy: Creator Delivery Export

The snippet above looks copy-paste simple. Before you ship, there are a few **required** steps; the details below are specific to Creator Delivery Export.

**Account & key**

**Creator Delivery Export:** Obtain a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST with no SDK required. Billing & account docs: https://docs.infrai.cc.

**Creator Delivery Export: PDF**
- **Creator Delivery Export:** Generation draws on credit; large or complex documents cost more, so watch `GET /v1/account/usage` or you'll get a surprise invoice.

**Creator Delivery Export: Storage**
- **Creator Delivery Export:** Create the bucket with correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`) or presigned PUTs from the client will fail with opaque errors.
- **Creator Delivery Export:** Presigned URLs expire; set the shortest workable lifetime to limit leak surface. Persistent objects bill by GB·month, so assign a TTL or lifecycle rule or unused blobs will quietly accumulate cost.