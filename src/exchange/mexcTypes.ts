export type MexcHttpMethod = "GET" | "POST" | "DELETE";

export type MexcRequestOptions = {
  method?: MexcHttpMethod;
  params?: Record<string, string | number | boolean | undefined>;
  signed?: boolean;
};

export type MexcApiErrorPayload = {
  code?: number;
  msg?: string;
};

export type MexcServerTimeResponse = {
  serverTime: number;
};

export type MexcAccountBalance = {
  asset: string;
  free: string;
  locked: string;
};

export type MexcAccountResponse = {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number | null;
  accountType: string;
  balances: MexcAccountBalance[];
  permissions: string[];
};
