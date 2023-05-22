import pipe from "https://deno.land/x/pipe@0.3.0/mod.ts";
import {
  collectAndCleanScripts,
  storeFunctionExecution,
} from "https://deno.land/x/scripted@0.0.2/mod.ts";
import { render } from "https://esm.sh/*preact-render-to-string@5.2.0";
import TwindStream from "https://esm.sh/@twind/with-react@1.1.3/readableStream.js";
import sql from "https://esm.sh/noop-tag@2.0.0";
import { twind, virtual } from "https://esm.sh/v103/@twind/core@1.1.2";

import * as Home from "./src/routes/Home.tsx";
import client from "./src/utils/clientLogger.ts";
import { twindOptions } from "./twind.ts";

import type { Routes } from "https://deno.land/x/rutt@0.1.0/mod.ts";
import type {
  QueryParameterSet,
  RowObject,
} from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import type { HandlerContext } from "https://deno.land/x/rutt@0.1.0/mod.ts";

type ActiveSessions = { [ip: string]: number };

const createGetSessionId = (activeSessions: ActiveSessions = {}) => {
  const getSessionId = (ip: string): number => {
    const halfHourAgo = Date.now() + 1000 * 60 * 60 * -0.5;
    if (!activeSessions[ip] || activeSessions[ip] < halfHourAgo)
      activeSessions[ip] = new Date().getTime();
    return activeSessions[ip];
  };
  return getSessionId;
};

const getSessionId = createGetSessionId();
const columnSafe = (k: string) => k.replace(/[^a-zA-Z0-9_]/g, "");

const calcMedian = (raw: number[]): number => {
  const arr = raw.filter((d) => d > 0);
  const mid = Math.floor(arr.length / 2);
  const sortedArr = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0
    ? sortedArr[mid]
    : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
};

const onAnalyzeFetchRequest = async (req: Request, ctx) => {
  const res = await ctx.db.query(sql`
WITH
  filtered AS (SELECT * FROM analytics_visits WHERE hostname NOT LIKE '%deno.dev' AND hostname NOT LIKE '%localhost%'),
  ua AS (
    SELECT
      CASE
        WHEN (user_agent LIKE '%tablet%' OR user_agent LIKE '%ipad%' OR user_agent LIKE '%playbook%' OR user_agent LIKE '%silk%') OR (user_agent LIKE '%android%' AND user_agent NOT LIKE '%mobi%') THEN 'tablet'
        WHEN (user_agent LIKE '%Mobile%' OR user_agent LIKE '%iP%' OR user_agent LIKE '%Android%' OR user_agent LIKE '%BlackBerry%' OR user_agent LIKE '%IEMobile%') OR (user_agent LIKE '%Kindle%' OR user_agent LIKE '%Silk-Accelerated%' OR user_agent LIKE '%hpwOS%' OR user_agent LIKE '%webOS%' OR user_agent LIKE '%Opera M%') THEN 'mobile'
        ELSE 'desktop'
      END AS device,
      CASE
        WHEN user_agent LIKE '%edg%' THEN 'Microsoft Edge'
        WHEN user_agent LIKE '%trident%' THEN 'Microsoft Internet Explorer'
        WHEN user_agent LIKE '%firefox%' OR user_agent LIKE '%fxios%' THEN 'Mozilla Firefox'
        WHEN user_agent LIKE '%chrome%' OR user_agent LIKE '%chromium%' OR user_agent LIKE '%crios%' THEN 'Google Chrome'
        WHEN user_agent LIKE '%safari%' THEN 'Apple Safari'
        ELSE 'Unknown Browser'
      END AS browser,
      CASE
        WHEN user_agent LIKE '%firefox%' OR user_agent LIKE '%fxios%' THEN
          'Firefox ' || SUBSTR(user_agent, INSTR(user_agent, 'Firefox/') + 8, LENGTH(user_agent))
        WHEN user_agent LIKE '%chrome%' OR user_agent LIKE '%chromium%' OR user_agent LIKE '%crios%' THEN
          'Chrome ' || SUBSTR(user_agent, INSTR(user_agent, 'Chrome/') + 7, 5)
        WHEN user_agent LIKE '%safari%' THEN
          'Apple Safari ' || SUBSTR(user_agent, INSTR(user_agent, 'Version/') + 8, 4)
        ELSE 'Unknown Version'
      END AS "version",
    *
    FROM filtered
  ),
  visits2 AS (SELECT *, SUBSTR(referrer, CASE WHEN INSTR(referrer, '://') > 0 THEN INSTR(referrer, '://') + 3 ELSE 1 END, CASE WHEN INSTR(SUBSTR(referrer, CASE WHEN INSTR(referrer, '://') > 0 THEN INSTR(referrer, '://') + 3 ELSE 1 END), '/') = 0 THEN LENGTH(referrer) ELSE INSTR(SUBSTR(referrer, CASE WHEN INSTR(referrer, '://') > 0 THEN INSTR(referrer, '://') + 3 ELSE 1 END), '/') - 1 END) as ref_hostname FROM ua),
  hits AS (SELECT COUNT(*) as hits FROM visits2),
  uniques AS (SELECT COUNT(DISTINCT ip) as uniques FROM visits2),
  "sessions" AS (SELECT COUNT(DISTINCT session_id) as "sessions" FROM visits2),
  bounces AS (SELECT COUNT(*) as bounces FROM (SELECT session_id, COUNT(*) as count FROM visits2 GROUP BY session_id HAVING count = 1) sq)
SELECT
  json_object(
    'hits', (SELECT hits FROM hits),
    'uniques', (SELECT uniques FROM uniques),
    'sessions', (SELECT "sessions" FROM "sessions"),
    'bounces', (SELECT bounces FROM bounces),
    'daily', (SELECT json_group_array(json_object('date', date, 'count', count)) FROM (SELECT DATE(id/1000, 'unixepoch') as date, COUNT(*) as count FROM visits2 GROUP BY date ORDER BY date)),
    'session_duration', (SELECT json_group_array(total_duration) FROM (SELECT session_id, SUM(visit_duration) as total_duration FROM visits2 GROUP BY session_id)),
    'visit_duration', (SELECT json_group_array(visit_duration) FROM visits2 WHERE visit_duration > 0),
    'load_time', (SELECT json_group_array(load_time) FROM visits2 WHERE load_time > 0),
    'cities', (SELECT json_group_array(json_object('city_name', city_name, 'country_code', country_code, 'views', count)) FROM (SELECT country_code, city_name, COUNT(*) as count FROM visits2 GROUP BY country_code, city_name ORDER BY count DESC)),
    'regions', (SELECT json_group_array(json_object('region_name', region_name, 'country_code', country_code, 'views', count)) FROM (SELECT country_code, region_name, COUNT(*) as count FROM visits2 GROUP BY country_code, region_name ORDER BY count DESC)),
    'countries', (SELECT json_group_array(json_object('country_code', country_code, 'views', count)) FROM (SELECT country_code, COUNT(*) as count FROM visits2 GROUP BY country_code ORDER BY count DESC)),
    'screens', (SELECT json_group_array(json_object('width', screen_width, 'height', screen_height, 'views', count)) FROM (SELECT screen_width, screen_height, COUNT(*) as count FROM visits2 GROUP BY screen_width, screen_height ORDER BY count DESC)),
    'locations', (SELECT json_group_array(json_object('path', path, 'views', count)) FROM (SELECT path, COUNT(*) as count FROM visits2 GROUP BY path ORDER BY count DESC)),
    'devices', (SELECT json_group_array(json_object('device', device, 'views', count)) FROM (SELECT device, COUNT(*) as count FROM visits2 GROUP BY device ORDER BY count DESC)),
    'browsers', (SELECT json_group_array(json_object('browser', browser, 'views', count)) FROM (SELECT browser, COUNT(*) as count FROM visits2 GROUP BY browser ORDER BY count DESC)),
    'versions', (SELECT json_group_array(json_object('version', "version", 'views', count)) FROM (SELECT "version", COUNT(*) as count FROM visits2 GROUP BY "version" ORDER BY count DESC)),
    'parameters', (SELECT json_group_array(json_object('key', key, 'value', value, 'views', count)) FROM (SELECT key, value, COUNT(*) as count FROM (SELECT json_each.key as key, json_each.value as value FROM visits2, json_each(visits2.parameters)) GROUP BY key, value ORDER BY count DESC)),
    'referrers', (SELECT json_group_array(json_object('referrer', referrer, 'views', count)) FROM (SELECT referrer, COUNT(*) as count FROM visits2 WHERE ref_hostname != hostname AND LENGTH(referrer) > 0 GROUP BY referrer ORDER BY count DESC)),
    'external_links', (SELECT json_group_array(json_object('href', href, 'count', count)) FROM (SELECT json_extract("value",'$.href') as href, COUNT(*) as count FROM analytics_events WHERE "action" = 'CLICK' AND category = 'EXTERNAL_LINK' GROUP BY href ORDER BY count DESC))
  ) as result
FROM hits, uniques, "sessions", bounces;
`);
  const results = res
    .map(({ result }) => JSON.parse(result))
    .map((res) => ({
      ...res,
      session_duration: calcMedian(res.session_duration),
      visit_duration: calcMedian(res.visit_duration),
      load_time: calcMedian(res.load_time),
    }));
  return /html/g.test(req.headers.get("accept") ?? "")
    ? ctx.rotten(Home)(req, { ...ctx, data: results })
    : new Response(JSON.stringify(results), {
        headers: { "content-type": "application/json" },
      });
};

const onVisitFetchRequest = async (req: Request, ctx: HandlerContext) => {
  const LOCATION_IP_API = `https://freegeoip.app/json/`;
  const json = await req.json();
  const { hostname, port } = ctx?.remoteAddr ?? {};
  const ip =
    req.headers.get("x-forwarded-for")?.split(",").shift() ||
    (hostname ? hostname + ":" + port : null);
  const geo = await fetch(new URL(ip, LOCATION_IP_API))
    .then((r) => (r.ok ? r.json() : null))
    .catch(console.warn)
    .then((v) => v ?? null);
  const payload = {
    ...json,
    session_id: new Date(getSessionId(ip)).getTime(),
    user_agent: req.headers.get("user-agent") ?? json.user_agent,
    ip,
    latitude: geo?.latitude,
    longitude: geo?.longitude,
    country_code: geo?.country_code,
    region_name: geo?.region_name,
    city_name: geo?.city,
  };
  const keys = Object.keys(payload).map(columnSafe);
  const columns = keys.map((v) => `"${v}"`).join(", ");
  const placeholders = keys.map(() => `?`).join(", ");
  const query = `INSERT INTO analytics_visits (${columns}) VALUES (${placeholders});`;
  const values = Object.values(payload).map((d) =>
    typeof d === "object" && d !== null ? JSON.stringify(d) : d ?? null
  );
  const res = await ctx.db.query(query, values);
  return new Response(JSON.stringify(res));
};

const onQuitFetchRequest = async (req: Request, ctx: HandlerContext) => {
  const { id, ...payload } = await req.json();
  const upCols = (v: string) => ["load_time", "visit_duration"].includes(v);
  const keys = Object.keys(payload).map(columnSafe).filter(upCols);
  const updates = keys.map((key) => `"${key}" = ?`).join(", ");
  const query = `UPDATE analytics_visits SET ${updates} WHERE id = ?;`;
  const values = Object.values(payload).map((d) =>
    typeof d === "object" && d !== null ? JSON.stringify(d) : d ?? null
  );
  const res = await ctx.db.query(query, [...values, id]);
  return new Response(JSON.stringify(res));
};

const onEventFetchRequest = async (req: Request, ctx: HandlerContext) => {
  const payload = await req.json();
  const keys = Object.keys(payload).map(columnSafe);
  const columns = keys.map((v) => `"${v}"`).join(", ");
  const placeholders = keys.map(() => `?`).join(", ");
  const query = `INSERT INTO analytics_events (${columns}) VALUES (${placeholders});`;
  const values = Object.values(payload).map((d) =>
    typeof d === "object" && d !== null ? JSON.stringify(d) : d ?? null
  );
  const res = await ctx.db.query(query, values);
  return new Response(JSON.stringify(res));
};

const addToContext =
  (
    handler: (
      req: Request,
      ctx: HandlerContext
    ) => Promise<Response> | Response,
    options: Record<string, any>
  ) =>
  (req: Request, ctx: HandlerContext): ReturnType<typeof handler> =>
    handler(req, { ...ctx, ...options });

export interface DB {
  query: (
    query: string,
    values?: QueryParameterSet
  ) => Promise<RowObject[] | undefined>;
}

export default async (prefix: string, db: DB): Promise<Routes> => {
  await db
    .query(
      sql`
    CREATE TABLE "analytics_visits" (
      id INTEGER DEFAULT (
        CAST(
          ROUND((julianday('now') - 2440587.5) * 86400000) As INTEGER
        )
      ) PRIMARY KEY,
      referrer TEXT,
      ip TEXT,
      user_agent TEXT,
      hostname TEXT,
      href TEXT,
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
    CREATE TABLE "analytics_events" (
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

  const rotten = (route: { default: (...args: any) => string }) =>
    pipe(
      route.default,
      (vn) =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("<!DOCTYPE html>".concat(render(vn)))
            );
            controller.close();
          },
        }),
      (stream: ReadableStream) =>
        stream.pipeThrough(new TwindStream(twind(twindOptions, virtual(true)))),
      (body) => new Response(body, { headers: { "content-type": "text/html" } })
    );

  const routes: Routes = {
    "OPTIONS@/": () => new Response(null, { status: 200 }),
    "GET@/": addToContext(onAnalyzeFetchRequest, { db, rotten }),
    "POST@/": addToContext(
      (req: Request, ctx) =>
        new URL(req.url).searchParams.has("visit")
          ? onVisitFetchRequest(req, ctx)
          : new URL(req.url).searchParams.has("event")
          ? onEventFetchRequest(req, ctx)
          : new URL(req.url).searchParams.has("quit")
          ? onQuitFetchRequest(req, ctx)
          : new Response(null, { status: 404 }),
      { db }
    ),
    "GET@/client.js": (req: Request) => {
      storeFunctionExecution(client, new URL(prefix, req.url));

      return new Response(collectAndCleanScripts(), {
        headers: { "content-type": "application/javascript" },
      });
    },
  };
  return routes;
};
