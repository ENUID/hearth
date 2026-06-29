import type { Express, Request, Response } from "express";
import { AGENT_CATALOG } from "./catalog";

type AuthFn = (req: Request) => boolean;

// The agents catalog is informational: installing/running happens IN the user's
// terminal (it's their machine), so the client just needs the command list.
export function mountAgents(app: Express, isAuthed: AuthFn): void {
  app.get("/api/agents", (req: Request, res: Response) => {
    if (!isAuthed(req)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    res.json({
      catalog: AGENT_CATALOG,
      // OpenAI-compatible base that "local" agents can target (also exported
      // into every terminal as $HEARTH_MODEL_URL).
      localModelApi: "/api/models/v1",
    });
  });
}
