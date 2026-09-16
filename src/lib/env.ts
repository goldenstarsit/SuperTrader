import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  databasePath: process.env.DATABASE_PATH ?? "./data/supertrader.db",
  mexcBaseUrl: process.env.MEXC_BASE_URL ?? "https://api.mexc.com",
  mexcApiKey: process.env.MEXC_API_KEY ?? "",
  mexcApiSecret: process.env.MEXC_API_SECRET ?? "",
  mexcRecvWindow: Number(process.env.MEXC_RECV_WINDOW ?? 5000),
} as const;

if (!Number.isFinite(env.mexcRecvWindow) || env.mexcRecvWindow <= 0) {
  throw new Error("MEXC_RECV_WINDOW must be a positive number.");
}
