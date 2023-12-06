import type { Handlers, RouteConfig } from "https://deno.land/x/fresh@1.6.0/server.ts";
import type { ContextState } from "../../../mod.ts";
import columnSafe from "../../utils/columnSafe.ts";

export const config: RouteConfig = {
  routeOverride: "/api/log/quit{/}?",
};

export const handler: Handlers<unknown, ContextState> = {
  GET: async (req: Request, ctx) => {
    const { id, ...payload } = await req.json();
    const upCols = (v: string) => ["load_time", "visit_duration"].includes(v);
    const keys = Object.keys(payload).map(columnSafe).filter(upCols);
    const updates = keys.map((key) => `"${key}" = ?`).join(", ");
    const query = `UPDATE analytics_visits SET ${updates} WHERE id = ?;`;
    const values = Object.values(payload).map((d) =>
      typeof d === "object" && d !== null ? JSON.stringify(d) : d ?? null
    );
    const res = await ctx.state.db.query(query, [...values, id]);
    return new Response(JSON.stringify(res));
  },
};
