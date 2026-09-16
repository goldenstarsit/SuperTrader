import db from "@/lib/database";
import { env } from "@/lib/env";

export default function Home() {
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>SuperTrader</h1>
      <p>MEXC DCA Trading Platform</p>
      <p>Environment: {env.nodeEnv}</p>
      <p>SQLite: Connected</p>
      <p>Schema version: {row?.value ?? "unknown"}</p>
    </main>
  );
}
