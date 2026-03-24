import express from 'express';
import cors from 'cors';
import type { ServerResponse } from 'http';
import { AIAgent } from './agent.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

interface ExtractRequestBody {
  url?: string;
  model?: string;
  apiKey?: string;
}

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Normalizes extraction input from either a JSON POST body or legacy query parameters.
const getExtractRequest = (req: express.Request) => {
  const body = (req.body ?? {}) as ExtractRequestBody;
  const isPost = req.method === 'POST';

  return {
    repoUrl: isPost ? body.url ?? '' : String(req.query.url ?? ''),
    modelId: isPost ? body.model ?? 'gemini-3-flash-preview' : String(req.query.model ?? 'gemini-3-flash-preview'),
    customApiKey: isPost ? body.apiKey : (req.query.apiKey as string | undefined),
  };
};

// Handles the extraction request lifecycle and streams progress/result events over SSE.
// Supports both the public route and Vercel's internal remapped path.
app.all(['/api/extract', '/extract'], async (req, res) => {
  const { repoUrl, modelId, customApiKey } = getExtractRequest(req);

  console.log('API extract hit', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    hasRepoUrl: Boolean(repoUrl),
    modelId,
    onVercel: Boolean(process.env.VERCEL),
  });

  if (!repoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Serializes a JSON payload into one SSE message for the connected browser.
  const writeSse = (payload: Record<string, unknown>) => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Client disconnected or response closed (e.g. Vercel timeout)
    }
  };

  // Adapts plain log messages into the shared SSE event format.
  const sendLog = (message: string) => {
    writeSse({ type: 'log', message });
  };

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as ServerResponse).flushHeaders?.();
  } catch {
    return;
  }

  const agent = new AIAgent(Math.random().toString(36).substring(7));

  try {
    const apis = await agent.run(repoUrl, sendLog, modelId, customApiKey);
    writeSse({ type: 'result', data: apis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeSse({ type: 'error', message });
  } finally {
    if (!res.writableEnded) {
      try {
        res.write('event: close\ndata: close\n\n');
        res.end();
      } catch {
        /* ignore */
      }
    }
  }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
/*
app.get('/:path(.*)', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
*/

// Vercel invokes the Express app as a serverless handler; do not bind a port there.
if (!process.env.VERCEL) {
  app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
  });
}

export default app;
