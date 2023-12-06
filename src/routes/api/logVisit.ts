import type { Handlers, RouteConfig } from "https://deno.land/x/fresh@1.6.0/server.ts";
import type { ContextState } from "../../../mod.ts";

import columnSafe from "../../utils/columnSafe.ts";

export const config: RouteConfig = {
  routeOverride: "/api/log/visit{/}?",
};

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

export const handler: Handlers<unknown, ContextState> = {
  POST: async (req: Request, ctx) => {
    const LOCATION_IP_API = `https://freegeoip.app/json/`;
    const json = await req.json();
    const { hostname, port } = ctx?.remoteAddr ?? {};
    const ip =
      req.headers.get("x-forwarded-for")?.split(",").shift() ||
      (hostname ? hostname + ":" + port : null);
    const geo = ip
      ? await fetch(new URL(ip, LOCATION_IP_API))
          .then((r) => (r.ok ? r.json() : null))
          .catch(console.warn)
          .then((v) => v ?? null)
      : null;
    const payload = {
      ...json,
      session_id: new Date(ip ? getSessionId(ip) : new Date()).getTime(),
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
    const res = await ctx.state.db.query(query, values);
    return new Response(JSON.stringify(res));
  },
};
