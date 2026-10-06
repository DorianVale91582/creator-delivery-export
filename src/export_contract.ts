import { z } from "zod";

export const exportRequestSchema = z.object({
  creatorId: z.string().min(1),
  exportId: z.string().uuid(),
  productTitle: z.string().min(1).max(120),
  subscribers: z.array(
    z.object({
      email: z.string().email(),
      deliveryStatus: z.enum(["delivered", "pending", "refunded"]),
      updatedAt: z.string().datetime(),
    }),
  ).max(10_000),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
