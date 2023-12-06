import createRequiredTables from "./src/utils/createRequiredTables.ts";
import createApiLogVisitPlugin from "./src/routes/api/logVisit.ts";
import * as ApiClientFile from "./src/routes/api/clientFile.ts";
import * as ApiLogEvent from "./src/routes/api/logEvent.ts";
import * as ApiLogExit from "./src/routes/api/logExit.ts";
import * as Home from "./src/routes/Home.tsx";
import twindConfig from "./twind.config.ts";
import type { GetIpData } from "./src/routes/api/logVisit.ts";
import type { Routes } from "https://deno.land/x/rutt@0.2.0/mod.ts";
import type {
  QueryParameterSet,
  RowObject,
} from "https://deno.land/x/sqlite@v3.8/mod.ts";

import createRenderPipe from "https://deno.land/x/outils@0.0.206/createRenderPipe.ts";
import middleware from "https://deno.land/x/outils@0.0.206/fresh/middleware.ts";
import * as staticFileRoute from "https://deno.land/x/outils@0.0.206/staticFileRoute.ts";
import { twind, virtual } from "https://esm.sh/@twind/core@1.1.3";
import TwindStream from "https://esm.sh/@twind/with-react@1.1.3/readableStream.js";
import { render as renderToString } from "https://esm.sh/preact-render-to-string@6.2.1&deps=preact@10.17.1&target=es2022";
import prepass from "https://esm.sh/preact-ssr-prepass@1.2.0?target=es2022&external=preact";
import toReadableStream from "https://esm.sh/to-readable-stream@4.0.0";

export type { S3Client } from "https://deno.land/x/s3_lite_client@0.6.2/mod.ts";
export type { Routes } from "https://deno.land/x/rutt@0.2.0/mod.ts";

export interface DB {
  query: (
    query: string,
    values?: QueryParameterSet,
  ) => Promise<RowObject[] | undefined>;
}

export interface ContextState {
  db: DB;
  prefix: string;
}

export interface AnalyticsOptions {
  prefix: string;
  database: DB;
  getIpData?: GetIpData;
  apiMiddleware?:
    | Parameters<typeof middleware>[0]
    | Parameters<typeof middleware>[0][];
  frontMiddleware?:
    | Parameters<typeof middleware>[0]
    | Parameters<typeof middleware>[0][];
}

export default async ({
  database: db,
  prefix,
  apiMiddleware,
  frontMiddleware,
  getIpData,
}: AnalyticsOptions): Promise<Routes> => {
  await createRequiredTables(db);
  const apiLogVisitPlugin = createApiLogVisitPlugin(getIpData);
  const renderPipe = createRenderPipe((vn) =>
    prepass(vn)
      .then(() => vn)
      .then((vn) => "<!DOCTYPE html>".concat(renderToString(vn)))
      .then((v) => new TextEncoder().encode(v))
      .then(toReadableStream)
      .then((stream) =>
        (stream as ReadableStream).pipeThrough(
          new TwindStream(twind(twindConfig(prefix), virtual(true))),
        )
      )
  );

  const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const withMiddlewares = (handler, isFront = false) =>
    middleware(
      ...toArray(isFront ? frontMiddleware : apiMiddleware),
      async (_, ctx) => {
        ctx.state.db = db;
        ctx.state.prefix = prefix;
        const r = await ctx.next().catch(console.error);
        return r;
      },
      handler,
    );

  return {
    [staticFileRoute.config.routeOverride!]: staticFileRoute.createHandler({
      baseUrl: import.meta.url,
      prefix,
    }),
    [Home.config.routeOverride!]: withMiddlewares(renderPipe(Home), true),
    [ApiLogEvent.config.routeOverride!]: withMiddlewares(
      renderPipe(ApiLogEvent),
    ),
    [ApiLogExit.config.routeOverride!]: withMiddlewares(renderPipe(ApiLogExit)),
    [apiLogVisitPlugin.config.routeOverride!]: withMiddlewares(
      renderPipe(apiLogVisitPlugin),
    ),
    [ApiClientFile.config.routeOverride!]: withMiddlewares(
      renderPipe(ApiClientFile),
    ),
  };
};
