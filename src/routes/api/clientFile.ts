import type {
  Handlers,
  RouteConfig,
} from "https://deno.land/x/fresh@1.6.0/server.ts";
import type { ContextState } from "../../../mod.ts";

import {
  collectAndCleanScripts,
  storeFunctionExecution,
} from "https://deno.land/x/scripted@0.0.3/mod.ts";

export const config: RouteConfig = {
  routeOverride: "/client.js",
};

const clientScript = (endpoint: string | URL) => {
  console.time("[double_analytics]");
  const VISIT = new URL("./api/log/visit", endpoint);
  const QUIT = new URL("./api/log/exit", endpoint);
  const EVENT = new URL("./api/log/event", endpoint);
  const IGNORE_KEY = "analytics:ignore";
  const newIgnore = new URL(document.location).searchParams.get(IGNORE_KEY);
  if (typeof newIgnore === "string")
    localStorage.setItem(IGNORE_KEY, newIgnore !== "false");
  const ignore = localStorage.getItem(IGNORE_KEY) === "true";
  if (ignore) console.warn("[double_analytics] ignored mode activated");
  const post = (e, v) => fetch(e, { method: "POST", body: JSON.stringify(v) });
  const beacon = (e, v) =>
    navigator.sendBeacon(
      e,
      new Blob([JSON.stringify(v)], { type: "application/json; charset=UTF-8" })
    );
  Object.fromEntries =
    Object.fromEntries ||
    ((arr) => arr.reduce((acc, [k, v]) => ((acc[k] = v), acc), {}));
  const id = Date.now();
  post(VISIT, {
    id,
    ignore,
    hostname: window.location.hostname,
    path: window.location.pathname,
    referrer: document.referrer,
    user_agent: navigator.userAgent,
    parameters: Object.fromEntries(new URL(document.location).searchParams),
    screen_width: window.screen.width,
    screen_height: window.screen.height,
  });
  const logEvent = (action, category, value) =>
    beacon(EVENT, {
      visit_id: id,
      action,
      category,
      value,
    });
  document.addEventListener("click", (e) => {
    const { host, href, target } = (e.target as HTMLElement).closest("a") || {};
    if (host && target === "_blank" && host !== window.location.host)
      logEvent("CLICK", "EXTERNAL_LINK", {
        href: href,
      });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      const load_time =
        (window.performance.timing.loadEventEnd -
          window.performance.timing.navigationStart) /
        1000;
      beacon(QUIT, {
        id,
        visit_duration: (new Date().getTime() - id) / 1000,
        load_time: load_time > 0 ? load_time : null,
      });
    }
  });
  console.timeEnd("[double_analytics]");
};

const join = (...str: string[]) => str.join("/").replace(/\/\//g, "/");

export const handler: Handlers<unknown, ContextState> = {
  GET: (req: Request, ctx) => {
    const url = new URL(join(".", ctx.state.prefix), req.url);
    storeFunctionExecution(clientScript, url.href);

    return new Response(collectAndCleanScripts(), {
      headers: { "content-type": "application/javascript" },
    });
  },
};
