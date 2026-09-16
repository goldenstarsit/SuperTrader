import { env } from "../lib/env";
import {
  createMexcSignature,
  serializeMexcParams,
} from "./mexcSigner";
import { parseMexcError } from "./mexcError";
import type {
  MexcRequestOptions,
  MexcServerTimeResponse,
  MexcAccountResponse,
} from "./mexcTypes";

export class MexcClient {
  private readonly baseUrl: string;

  constructor(baseUrl = env.mexcBaseUrl) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  private async request<T>(
    path: string,
    options: MexcRequestOptions = {},
  ): Promise<T> {
    const method = options.method ?? "GET";
    const params: Record<string, string | number | boolean | undefined> = {
      ...(options.params ?? {}),
    };

    if (options.signed) {
      if (!env.mexcApiKey || !env.mexcApiSecret) {
        throw new Error(
          "MEXC API credentials are required for signed requests.",
        );
      }

      params.recvWindow = env.mexcRecvWindow;
      params.timestamp = Date.now();
    }

    const serializedParams = serializeMexcParams(params);

    if (options.signed) {
      const signature = createMexcSignature(
        serializedParams,
        env.mexcApiSecret,
      );

      params.signature = signature;
    }

    const finalQuery = serializeMexcParams(params);
    const url = `${this.baseUrl}${path}${
      finalQuery ? `?${finalQuery}` : ""
    }`;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (options.signed) {
      headers["X-MEXC-APIKEY"] = env.mexcApiKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      cache: "no-store",
    });

    const text = await response.text();

    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(
          `MEXC returned invalid JSON (HTTP ${response.status}).`,
        );
      }
    }

    if (!response.ok) {
      const errorPayload =
        payload && typeof payload === "object"
          ? payload
          : {};

      throw parseMexcError(
        response.status,
        errorPayload as {
          code?: number;
          msg?: string;
        },
      );
    }

    return payload as T;
  }

  async getServerTime(): Promise<MexcServerTimeResponse> {
    return this.request<MexcServerTimeResponse>("/api/v3/time");
  }

  async getAccount(): Promise<MexcAccountResponse> {
    return this.request<MexcAccountResponse>("/api/v3/account", {
      signed: true,
    });
  }
}

export const mexcClient = new MexcClient();
