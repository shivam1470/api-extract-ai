import type { IncomingMessage, ServerResponse } from 'http';
import { AIAgent } from '../agent.js';

// Implements the serverless extraction endpoint used by Vercel deployments.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = (req.headers.host ?? 'localhost') as string;
  const requestUrl = new URL(req.url ?? '', `http://${host}`);
  const repoUrl = requestUrl.searchParams.get('url') ?? '';
  const modelId = requestUrl.searchParams.get('model') ?? 'gemini-3-flash-preview';
  const customApiKey = requestUrl.searchParams.get('apiKey') ?? undefined;

  // Writes one structured progress/result/error event into the SSE response stream.
  const writeSse = (payload: Record<string, unknown>) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  if (!repoUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'URL is required' }));
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const agent = new AIAgent(Math.random().toString(36).substring(7));

  try {
    writeSse({ type: 'log', message: 'Starting extraction...' });
    const apis = await agent.run(repoUrl, (message) => writeSse({ type: 'log', message }), modelId, customApiKey);
    writeSse({ type: 'result', data: apis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeSse({ type: 'error', message });
  } finally {
    if (!res.writableEnded) {
      res.write('event: close\ndata: close\n\n');
      res.end();
    }
  }
}
