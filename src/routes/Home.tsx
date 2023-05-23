import { h, Fragment } from "https://esm.sh/preact@10.15.0";

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

export default (req: Request, ctx) => {
  const {
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
  } = ctx.data[0];

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <title>Analytics - {new URL(req.url).hostname}</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/charts.css/dist/charts.min.css"
        />
      </head>
      <body>
        <main className="p-4 flex flex-col gap-4 mb-4">
          <div className="flex gap-1 items-baseline">
            <span>{new URL(req.url).hostname}</span>
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
