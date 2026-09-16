import { mexcClient } from "./mexcClient";

export type FreeAssetBalance = {
  asset: string;
  free: number;
};

function parsePositiveOrZero(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid MEXC ${fieldName}: ${value}`);
  }

  return parsed;
}

export class MexcAccountService {
  async getFreeBalance(asset: string): Promise<FreeAssetBalance> {
    const normalizedAsset = asset.trim().toUpperCase();

    if (!normalizedAsset) {
      throw new Error("asset is required.");
    }

    const account = await mexcClient.getAccount();

    const balance = account.balances.find(
      (item) => item.asset.toUpperCase() === normalizedAsset,
    );

    if (!balance) {
      return {
        asset: normalizedAsset,
        free: 0,
      };
    }

    return {
      asset: normalizedAsset,
      free: parsePositiveOrZero(balance.free, `${normalizedAsset} free balance`),
    };
  }
}

export const mexcAccountService = new MexcAccountService();
