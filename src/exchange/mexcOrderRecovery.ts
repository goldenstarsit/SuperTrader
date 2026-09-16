import { MexcApiError } from "./mexcError";

export function isMexcOrderNotFoundError(error: unknown): boolean {
  if (!(error instanceof MexcApiError)) {
    return false;
  }

  return error.status === 404 || error.code === -2013;
}
