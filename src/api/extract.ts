import type { IncomingMessage, ServerResponse } from 'http';
import { AIAgent } from '../agent.js';

interface ExtractRequestBody {
  url?: string;
  model?: string;
  apiKey?: string;
}

// Reads a small JSON request body for POST-based extraction requests.
async function readJsonBody(req: IncomingMessage): Promise<ExtractRequestBody> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ExtractRequestBody;
}

// Implements the serverless extraction endpoint used by Vercel deployments.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = (req.headers.host ?? 'localhost') as string;
  const requestUrl = new URL(req.url ?? '', `http://${host}`);
  const body = req.method === 'POST' ? await readJsonBody(req) : {};
  const repoUrl = req.method === 'POST' ? body.url ?? '' : requestUrl.searchParams.get('url') ?? '';
  const modelId = req.method === 'POST' ? body.model ?? 'gemini-3-flash-preview' : requestUrl.searchParams.get('model') ?? 'gemini-3-flash-preview';
  const customApiKey = req.method === 'POST' ? body.apiKey : requestUrl.searchParams.get('apiKey') ?? undefined;

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
