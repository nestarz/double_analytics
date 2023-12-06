import columnSafe from "../../utils/columnSafe.ts";
import type { Handlers } from "https://deno.land/x/fresh@1.6.0/server.ts";
import type { ContextState } from "../../../mod.ts";
import { RouteConfig } from "$fresh/server.ts";

type ActiveSessions = { [ip: string]: number };

const createGetSessionId = (activeSessions: ActiveSessions = {}) => {
  const getSessionId = (ip: string): number => {
    const halfHourAgo = Date.now() + 1000 * 60 * 60 * -0.5;
    if (!activeSessions[ip] || activeSessions[ip] < halfHourAgo) {
      activeSessions[ip] = new Date().getTime();
    }
    return activeSessions[ip];
  };
  return getSessionId;
};

const getSessionId = createGetSessionId();

export type GetIpData = (ip: string) => Promise<
  null | undefined | {
    latitude: string;
    longitude: string;
    country_code: string;
    region_code: string;
    city_name: string;
  }
>;

export const createApiLogVisitPlugin: (
  getIpData?: GetIpData,
) => { config: RouteConfig; handler: Handlers<unknown, ContextState> } = (
  getIpData,
) => ({
  config: { routeOverride: "/api/log/visit{/}?" },
  handler: {
    POST: async (req: Request, ctx) => {
      const json = await req.json();
      const { hostname, port } = ctx?.remoteAddr ?? {};
      const ip = req.headers.get("x-forwarded-for")?.split(",").shift() ||
        (hostname ? hostname + ":" + port : null);
      const geo = ip ? await getIpData?.(ip) : null;
      console.log(ctx.remoteAddr, ip, geo);
      const payload = {
        ...json,
        session_id: new Date(ip ? getSessionId(ip) : new Date()).getTime(),
        user_agent: req.headers.get("user-agent") ?? json.user_agent,
        ip,
        latitude: geo?.latitude,
        longitude: geo?.longitude,
        country_code: geo?.country_code,
        region_name: geo?.region_code,
        city_name: geo?.city_name,
      };

      const keys = Object.keys(payload).map(columnSafe);
      const columns = keys.map((v) => `"${v}"`).join(", ");
      const placeholders = keys.map(() => `?`).join(", ");
      const query =
        `INSERT INTO analytics_visits (${columns}) VALUES (${placeholders});`;
      const values = Object.values(payload).map((d) =>
        typeof d === "object" && d !== null ? JSON.stringify(d) : d ?? null
      );
      const res = await ctx.state.db.query(query, values);
      return new Response(JSON.stringify(res));
    },
  },
});

export default createApiLogVisitPlugin;
