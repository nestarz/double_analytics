import sql from "https://esm.sh/noop-tag@2.0.0";
import type { DB } from "../../mod.ts";

export default async (db: DB) => {
  await db
    .query(
      sql`
  CREATE TABLE IF NOT EXISTS "analytics_visits" (
    id INTEGER DEFAULT (
      CAST(
        ROUND((julianday('now') - 2440587.5) * 86400000) As INTEGER
      )
    ) PRIMARY KEY,
    referrer TEXT,
    ip TEXT,
    user_agent TEXT,
    hostname TEXT,
    latitude REAL,
    longitude REAL,
    country_code TEXT,
    region_name TEXT,
    city_name TEXT,
    parameters TEXT,
    screen_width INTEGER,
    screen_height INTEGER,
    load_time REAL,
    visit_duration REAL,
    "path" TEXT,
    session_id INTEGER,
    ignore INTEGER
  ) STRICT;
  `
    )
    .catch(() => null);
  await db
    .query(
      sql`
  CREATE TABLE IF NOT EXISTS "analytics_events" (
    id INTEGER DEFAULT (
      CAST(
        ROUND((julianday('now') - 2440587.5) * 86400000) As INTEGER
      )
    ) NOT NULL,
    visit_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    value TEXT NULL,
    label TEXT NULL,
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON UPDATE RESTRICT ON DELETE RESTRICT
  );  
`
    )
    .catch(() => null);
};
