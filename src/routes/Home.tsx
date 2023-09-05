/** @jsxImportSource https://esm.sh/preact@10.17.1 */
import type {
  Handlers,
  PageProps,
  RouteConfig,
} from "https://deno.land/x/fresh@1.4.2/server.ts";
import type { ContextState } from "../../mod.ts";

import { Fragment } from "https://esm.sh/preact@10.17.1";
import sql from "https://esm.sh/noop-tag@2.0.0";

const fr = "fr-FR";
const percent = (v) => [fr, { style: "percent", maximumFractionDigits: v }];
const round = [fr, { maximumFractionDigits: 2 }];
const noop = (v) => v;
const max = (arr, fn) => Math.max(...arr.map(fn));
const bff = (v) =>
  ({ sessions: "Visits", views: "Views", count: "Total", percent: "%" }[v] ??
  v);
const bffn = (key, v) =>
  (({ percent: (v) => v?.toLocaleString(...percent(1)) }[key] ?? noop)(v));

const Row = ({
  title,
  depth = 0,
  head,
  data: { children, ...details },
  lastItem,
}) => (
  <Fragment>
    <tr>
      {Object.entries({ ...details })
        .map(([key, value], i) =>
          head ? bff(i === 0 ? title ?? key : key) : bffn(key, value)
        )
        .map((v, i) => (
          <td
            className={
              (head
                ? "w-1/2 px-4 py-2 text-stone-900 text-left"
                : "px-4 py-2 text-stone-500 truncate max-w-xs") +
              (i === 0 ? " font-semibold" : "")
            }
          >
            {i === 0 && (depth ? (lastItem ? "└─\t" : "├─\t") : "")}
            {typeof v === "string" || typeof v === "number" || !v
              ? v || "N/A"
              : Object.values(v)
                  .filter((v) => v)
                  .join(", ") || "N/A"}
          </td>
        ))}
    </tr>
    {!head && children
      ? children.map((data, k, arr) => (
          <Row
            lastItem={k === arr.length - 1}
            depth={depth + 1}
            head={head}
            data={data}
          />
        ))
      : ""}
  </Fragment>
);

const Table = ({ title, data }) =>
  data?.length > 0 && (
    <section className="max-h-[15rem] overflow-y-auto">
      {data.length === 0 ? (
        <i>{title}: Aucune données</i>
      ) : (
        <table className="border-collapse w-full bg-white text-sm">
          <thead className="bg-stone-50 sticky top-0">
            {data.slice(-1).map((data) => (
              <Row title={title} head={true} data={data} />
            ))}
          </thead>
          <tbody>
            {data.map((data) => (
              <Row data={data} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

export const config: RouteConfig = {
  routeOverride: "/",
};

export const handler: Handlers<unknown, ContextState> = {
  GET: async (req: Request, ctx) => {
    const res = await ctx.state.db.query(sql`
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
    'session_duration', (SELECT avg(total_duration) FROM (SELECT session_id, SUM(visit_duration) as total_duration FROM visits2 GROUP BY session_id)),
    'visit_duration', (SELECT avg(visit_duration) FROM visits2 WHERE visit_duration > 0),
    'load_time', (SELECT avg(load_time) FROM visits2 WHERE load_time > 0),
    'cities', (SELECT json_group_array(json_object('city_name', city_name, 'country_code', country_code, 'views', count)) FROM (SELECT country_code, city_name, COUNT(*) as count FROM visits2 GROUP BY country_code, city_name ORDER BY count DESC)),
    'regions', (SELECT json_group_array(json_object('region_name', region_name, 'country_code', country_code, 'views', count)) FROM (SELECT country_code, region_name, COUNT(*) as count FROM visits2 GROUP BY country_code, region_name ORDER BY count DESC)),
    'countries', (SELECT json_group_array(json_object('country_code', country_code, 'views', count)) FROM (SELECT country_code, COUNT(*) as count FROM visits2 GROUP BY country_code ORDER BY count DESC)),
    'screens', (SELECT json_group_array(json_object('width', screen_width, 'height', screen_height, 'views', count)) FROM (SELECT screen_width, screen_height, COUNT(*) as count FROM visits2 GROUP BY screen_width, screen_height ORDER BY count DESC)),
    'locations', (SELECT json_group_array(json_object('path', path, 'views', count)) FROM (SELECT path, COUNT(*) as count FROM visits2 GROUP BY path ORDER BY count DESC)),
    'devices', (SELECT json_group_array(json_object('device', device, 'views', count)) FROM (SELECT device, COUNT(*) as count FROM visits2 GROUP BY device ORDER BY count DESC)),
    'browsers', (SELECT json_group_array(json_object('browser', browser, 'views', count)) FROM (SELECT browser, COUNT(*) as count FROM visits2 GROUP BY browser ORDER BY count DESC)),
    'versions', (SELECT json_group_array(json_object('version', "version", 'views', count)) FROM (SELECT "version", COUNT(*) as count FROM visits2 GROUP BY "version" ORDER BY count DESC)),
    'parameters', (SELECT json_group_array(json_object('key', key, 'value', value, 'views', count)) FROM (SELECT key, value, COUNT(*) as count FROM (SELECT json_each.key as key, json_each.value as value FROM visits2, json_each(visits2.parameters) WHERE key != 'fbclid') GROUP BY key, value ORDER BY count DESC)),
    'referrers', (SELECT json_group_array(json_object('referrer', referrer, 'views', count)) FROM (SELECT referrer, COUNT(*) as count FROM visits2 WHERE ref_hostname != hostname AND LENGTH(referrer) > 0 GROUP BY referrer ORDER BY count DESC)),
    'external_links', (SELECT json_group_array(json_object('href', href, 'count', count)) FROM (SELECT json_extract("value",'$.href') as href, COUNT(*) as count FROM analytics_events WHERE "action" = 'CLICK' AND category = 'EXTERNAL_LINK' GROUP BY href ORDER BY count DESC))
  ) as result
FROM hits, uniques, "sessions", bounces;
`);
    const results = res?.map(({ result }) => JSON.parse(result));
    return /html/g.test(req.headers.get("accept") ?? "")
      ? ctx.render(results?.[0])
      : new Response(JSON.stringify(results), {
          headers: { "content-type": "application/json" },
        });
  },
};

export default ({
  data: {
    external_links,
    hits,
    sessions,
    uniques,
    bounces,
    session_duration,
    referrers,
    parameters,
    cities,
    countries,
    devices,
    browsers,
    versions,
    locations,
    load_time,
    screens,
    daily,
  } = {},
  url,
}: PageProps<any>) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <title>Analytics - {url.hostname}</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/charts.css/dist/charts.min.css"
        />
      </head>
      <body>
        <main className="p-4 flex flex-col gap-4 mb-4">
          <div className="flex gap-1 items-baseline">
            <span>{url.hostname}</span>
            <span className="text-xs">Analytics</span>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 flex-wrap">
              {[
                { key: "Unique Visitors", value: uniques },
                { key: "Total Visits", value: sessions },
                { key: "Total PageViews", value: hits },
                {
                  key: "Views per Visit",
                  value: (hits / (sessions ?? 1)).toFixed(1),
                },
                {
                  key: "Bounce rate",
                  value: (bounces / sessions)?.toLocaleString(...percent(1)),
                },
                {
                  key: "Visit Duration",
                  value:
                    (session_duration || 0)?.toLocaleString(...round) + "s",
                },
                {
                  key: "Loading Time",
                  value:
                    ((load_time || 0) * 1000)?.toLocaleString(...round) + "ms",
                },
              ].map(({ key, value }) => (
                <div className="flex flex-col">
                  <div className="text-sm font-bold">{key}</div>
                  <div className="">{value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="chart h-[7rem] mr-auto w-full">
            <table
              className="charts-css area show-labels h-[7rem]"
              style={{ "--color": "#f5f5f4" }}
            >
              <tbody>
                {daily
                  .slice(-14)
                  .map(({ date, count: sessions }, _, arr) => ({
                    sessions,
                    x: date,
                    y:
                      sessions /
                      (max(arr, ({ count: sessions }) => sessions) + 1),
                  }))
                  .map((d, i, arr) => ({ ...d, y_1: arr[i - 1]?.y ?? 0 }))
                  .map(({ sessions, x, y_1, y }) => (
                    <tr>
                      <th
                        scope="row"
                        className="font-medium text-xs text-stone-600"
                      >
                        {new Date(x).toLocaleString("fr-FR", {
                          month: "short",
                          day: "2-digit",
                        })}
                      </th>
                      <td
                        style={{ "--start": y_1, "--size": y }}
                        className="font-medium text-xs text-stone-600"
                      >
                        <span className="data">{sessions}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-fill-96 gap-4">
            <Table data={locations} title="Top Pages" />
            <Table data={referrers} title="Top Sources" />
            <Table data={cities} title="Cities" />
            <Table data={countries} title="Countries" />
            <Table data={devices} title="Devices" />
            <Table data={browsers} title="Browsers" />
            <Table data={versions} title="Versions" />
            <Table data={screens} title="Screens" />
            <Table data={external_links} title="External Links" />
            <Table data={parameters} title="Parameters" />
          </div>
        </main>
        <footer className="fixed bottom-0 left-0 p-4 text-xs">
          <a href="https://bureaudouble.com" target="_blank">
            Bureau Double
          </a>
        </footer>
      </body>
    </html>
  );
};
