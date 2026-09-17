import db from "../../lib/database";

export type ReconciliationRecordStatus =
  | "SUCCESS"
  | "MISMATCH"
  | "FAILED";

export type ReconciliationRecord = {
  id: number;
  cycle_id: number | null;
  symbol: string;
  orders_checked: number;
  orders_updated: number;
  fills_checked: number;
  fills_inserted: number;
  mismatches_json: string;
  status: ReconciliationRecordStatus;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export const reconciliationRecordRepository = {
  create(input: {
    cycleId: number | null;
    symbol: string;
    ordersChecked: number;
    ordersUpdated: number;
    fillsChecked: number;
    fillsInserted: number;
    mismatches: string[];
    status: ReconciliationRecordStatus;
    errorMessage?: string;
    completedAt?: string;
  }): number {
    const result = db.prepare(`
      INSERT INTO reconciliation_records (
        cycle_id,
        symbol,
        orders_checked,
        orders_updated,
        fills_checked,
        fills_inserted,
        mismatches_json,
        status,
        error_message,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.cycleId,
      input.symbol,
      input.ordersChecked,
      input.ordersUpdated,
      input.fillsChecked,
      input.fillsInserted,
      JSON.stringify(input.mismatches),
      input.status,
      input.errorMessage ?? null,
      input.completedAt ?? null,
    );

    return Number(result.lastInsertRowid);
  },

  findById(id: number): ReconciliationRecord | undefined {
    return db
      .prepare(`
        SELECT *
        FROM reconciliation_records
        WHERE id = ?
      `)
      .get(id) as ReconciliationRecord | undefined;
  },

  findLatestBySymbol(symbol: string): ReconciliationRecord | undefined {
    return db
      .prepare(`
        SELECT *
        FROM reconciliation_records
        WHERE symbol = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(symbol) as ReconciliationRecord | undefined;
  },

  findLatestByCycleId(cycleId: number): ReconciliationRecord | undefined {
    return db
      .prepare(`
        SELECT *
        FROM reconciliation_records
        WHERE cycle_id = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(cycleId) as ReconciliationRecord | undefined;
  },
};
