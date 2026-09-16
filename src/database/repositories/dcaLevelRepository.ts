import db from "../../lib/database";

export type DcaLevelStatus =
  | "PENDING"
  | "ORDERED"
  | "FILLED"
  | "SKIPPED";

export type DcaLevel = {
  id: number;
  cycle_id: number;
  level: number;
  drop_percent: number;
  target_price: number;
  status: DcaLevelStatus;
  order_id: number | null;
  created_at: string;
  updated_at: string;
};

export const dcaLevelRepository = {
  create(input: {
    cycleId: number;
    level: number;
    dropPercent: number;
    targetPrice: number;
  }): number {
    const result = db.prepare(`
      INSERT INTO dca_levels (
        cycle_id, level, drop_percent, target_price, status
      )
      VALUES (?, ?, ?, ?, 'PENDING')
    `).run(
      input.cycleId,
      input.level,
      input.dropPercent,
      input.targetPrice,
    );

    return Number(result.lastInsertRowid);
  },

  findByCycleId(cycleId: number): DcaLevel[] {
    return db
      .prepare("SELECT * FROM dca_levels WHERE cycle_id = ? ORDER BY level")
      .all(cycleId) as DcaLevel[];
  },

  findByCycleAndLevel(
    cycleId: number,
    level: number,
  ): DcaLevel | undefined {
    return db
      .prepare(`
        SELECT *
        FROM dca_levels
        WHERE cycle_id = ? AND level = ?
      `)
      .get(cycleId, level) as DcaLevel | undefined;
  },

  updateStatus(
    id: number,
    status: DcaLevelStatus,
    orderId?: number,
  ): void {
    db.prepare(`
      UPDATE dca_levels
      SET status = ?,
          order_id = COALESCE(?, order_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, orderId ?? null, id);
  },
};
