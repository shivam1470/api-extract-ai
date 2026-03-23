import type { Config } from "@netlify/functions";
import { AIAgent } from "../../src/agent.ts";

export default async (req: Request) => {
  const url = new URL(req.url);
  const repoUrl = url.searchParams.get("url") || "";
  const modelId = url.searchParams.get("model") || "gemini-3-flash-preview";
  const customApiKey = url.searchParams.get("apiKey") || undefined;

  if (!repoUrl) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const writeSse = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          // Stream may be closed
        }
      };

      const agent = new AIAgent(Math.random().toString(36).substring(7));

      try {
        const apis = await agent.run(
          repoUrl,
          (message: string) => writeSse({ type: "log", message }),
          modelId,
          customApiKey
        );
        writeSse({ type: "result", data: apis });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        writeSse({ type: "error", message });
      } finally {
        try {
          controller.enqueue(
            encoder.encode("event: close\ndata: close\n\n")
          );
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};

export const config: Config = {
  path: "/api/extract",
  method: "GET",
};
