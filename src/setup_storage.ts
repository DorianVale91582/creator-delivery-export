import { infrai } from "./infrai.ts";

const bucket = process.env.INFRAI_EXPORT_BUCKET ?? "creator-delivery-exports";
await infrai.storage.bucket.create(bucket);
console.log(`Created export bucket: ${bucket}`);
