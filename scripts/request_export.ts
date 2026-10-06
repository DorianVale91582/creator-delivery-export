export {};

const response = await fetch("http://localhost:3000/exports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    creatorId: "creator_42",
    exportId: "8d55e87e-1558-4614-a7b4-bc88d8f10c23",
    productTitle: "Studio Lighting Workbook",
    subscribers: [
      {
        email: "reader@example.com",
        deliveryStatus: "delivered",
        updatedAt: "2026-09-21T08:30:00.000Z"
      },
      {
        email: "queued@example.com",
        deliveryStatus: "pending",
        updatedAt: "2026-09-21T08:32:00.000Z"
      }
    ]
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
