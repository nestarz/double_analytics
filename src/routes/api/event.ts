import type { Handlers } from "https://deno.land/x/fresh@1.4.2/server.ts";
import type { ContextState } from "../../../mod.ts";
import columnSafe from "../../utils/columnSafe.ts";

export const handler: Handlers<unknown, ContextState> = {
  GET: async (req: Request, ctx) => {
    const payload = await req.json();
    const keys = Object.keys(payload).map(columnSafe);
    const columns = keys.map((v) => `"${v}"`).join(", ");
    const placeholders = keys.map(() => `?`).join(", ");
    const query = `INSERT INTO analytics_events (${columns}) VALUES (${placeholders});`;
    const values = Object.values(payload).map((d) =>
      typeof d === "object" && d !== null ? JSON.stringify(d) : d ?? null
    );
    const res = await ctx.state.db.query(query, values);
    return new Response(JSON.stringify(res));
  },
};