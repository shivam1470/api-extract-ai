import express from 'express';
import cors from 'cors';
import { AIAgent } from './agent.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = '127.0.0.1';

app.use(cors());
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('/api/extract', async (req, res) => {
  const repoUrl = req.query.url as string;
  const modelId = (req.query.model as string) || 'gemini-3-flash-preview';
  const customApiKey = req.query.apiKey as string;

  if (!repoUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (message: string) => {
    res.write(`data: ${JSON.stringify({ type: 'log', message })}\n\n`);
  };

  const agent = new AIAgent(Math.random().toString(36).substring(7));
  
  try {
    const apis = await agent.run(repoUrl, sendLog, modelId, customApiKey);
    res.write(`data: ${JSON.stringify({ type: 'result', data: apis })}\n\n`);
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
  } finally {
    res.write('event: close\ndata: close\n\n');
    res.end();
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
