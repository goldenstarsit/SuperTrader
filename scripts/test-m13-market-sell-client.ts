import assert from "node:assert/strict";
import { MexcClient } from "../src/exchange/mexcClient";

async function main() {
  const client = new MexcClient("https://example.invalid");

  assert.equal(typeof client.placeMarketSell, "function");

  await assert.rejects(
    () => client.placeMarketSell("BTCUSDT", 0, "m13-test"),
    /quantity must be greater than zero/,
  );

  await assert.rejects(
    () => client.placeMarketSell("BTCUSDT", -0.001, "m13-test"),
    /quantity must be greater than zero/,
  );

  await assert.rejects(
    () => client.placeMarketSell("BTCUSDT", 0.001, ""),
    /newClientOrderId is required/,
  );

  console.log("M13 MARKET SELL CLIENT: PASS");
  console.log("Live SELL orders: NONE");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
