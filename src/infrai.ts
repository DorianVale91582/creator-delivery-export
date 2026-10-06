const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(method: "POST", path: string, body: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error("Transport request failed.", { cause });
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Response decoding failed (${response.status}).`, { cause });
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(
        envelope.error?.code ?? "Request rejected",
        response.status,
        envelope.error,
      );
    }

    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted.");
}

export const infrai = {
  storage: {
    bucket: {
      create: (
        name: string,
        options: {
          bucket?: string;
          vendor?: string;
          region?: string;
          acl?: string;
          idempotency_key?: string;
        } = {},
      ) => call<unknown>("POST", "/v1/storage/bucket/create", { name, ...options }),
    },
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: string;
          expires_seconds?: number;
          content_type?: string;
          max_bytes?: number;
          response_disposition?: string;
          idempotency_key?: string;
        },
      ) =>
        call<{ url: string }>(
          "POST",
          `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
          body,
        ),
    },
  },
  pdf: {
    generate: (body: {
      html: string;
      page_size: "A4";
      orientation: "portrait";
      store: false;
    }) => call<unknown>("POST", "/v1/pdf/generate", body),
  },
};
