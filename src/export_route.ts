import { createServer } from "node:http";
import { ZodError } from "zod";
import { createCreatorExport } from "./creator_export.ts";
import { exportRequestSchema } from "./export_contract.ts";
import { InfraiError } from "./infrai.ts";

const port = Number(process.env.PORT ?? 3000);

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/exports") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = exportRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await createCreatorExport(input);
    json(response, 201, result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "Invalid export request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
      return;
    }
    console.error(error);
    json(response, 502, { error: "Export could not be created" });
  }
});

server.listen(port, () => console.log(`Creator export route listening on http://localhost:${port}`));
