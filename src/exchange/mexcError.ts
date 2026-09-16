import type { MexcApiErrorPayload } from "./mexcTypes";

export class MexcApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly responseMessage: string | null;

  constructor(
    message: string,
    options: {
      status: number;
      code?: number | null;
      responseMessage?: string | null;
    },
  ) {
    super(message);
    this.name = "MexcApiError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.responseMessage = options.responseMessage ?? null;
  }
}

export function parseMexcError(
  status: number,
  payload: MexcApiErrorPayload,
): MexcApiError {
  const responseMessage = payload.msg ?? null;
  const code = payload.code ?? null;

  return new MexcApiError(
    responseMessage
      ? `MEXC API error ${code ?? "unknown"}: ${responseMessage}`
      : `MEXC API HTTP error: ${status}`,
    {
      status,
      code,
      responseMessage,
    },
  );
}
