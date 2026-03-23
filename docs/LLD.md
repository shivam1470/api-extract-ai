# API Extract AI Agent: Low-Level Design

## 1. Scope

This document describes the concrete module design, request handling, state transitions, and data structures used by the current implementation.

## 2. Source Layout

- `src/server.ts`
- `src/api/extract.ts`
- `src/agent.ts`
- `client/src/App.tsx`
- `client/src/main.tsx`
- `client/src/App.css`
- `vercel.json`

## 3. Module Design

### 3.1 `src/server.ts`

Responsibilities:

- Initialize Express application
- Enable CORS and JSON middleware
- Serve built frontend assets from `client/dist`
- Expose SSE extraction route for local development and Vercel-routed compatibility
- Start the HTTP server in non-Vercel environments

Key behavior:

- Binds route handlers to both `/api/extract` and `/extract`
- Reads `url`, `model`, and `apiKey` from query parameters
- Streams JSON-serialized SSE messages using `res.write`
- Creates a per-request `AIAgent` instance

SSE event contract:

- Log event: `data: {"type":"log","message":"..."}`
- Result event: `data: {"type":"result","data":[...]}`
- Error event: `data: {"type":"error","message":"..."}`
- Close event: `event: close\ndata: close`

### 3.2 `src/api/extract.ts`

Responsibilities:

- Provide a Vercel-compatible function entry point
- Re-implement the same extraction flow used in `src/server.ts`

Notes:

- Parses URL parameters manually from the raw Node request
- Uses the same `AIAgent.run()` orchestration as the local server
- Duplicates some SSE and validation logic from `src/server.ts`

### 3.3 `src/agent.ts`

Responsibilities:

- Load environment variables
- Resolve the effective Google API key
- Create request-scoped temporary repository workspace
- Fetch repository contents
- Select candidate files
- Chunk and submit prompt context to Gemini
- Parse and aggregate API extraction results
- Delete temporary workspace

Internal methods:

- `run(githubUrl, onLog, modelId, customApiKey)`
  Orchestrates the full extraction lifecycle.
- `parseGithubRepo(url)`
  Validates and extracts GitHub owner/repo from URL.
- `cloneGithubArchive(githubUrl)`
  Retrieves repository metadata and downloads zipball.
- `extractZipToRepoPath(arrayBuffer)`
  Extracts archive to staging directory and renames root folder.
- `cloneRepo(url)`
  Selects zip download for GitHub or `simple-git` clone for other hosts.
- `scanFiles(dir, fileList)`
  Recursively scans candidate files using path and extension heuristics.
- `analyzeFiles(files, onLog, ai, modelId)`
  Chunks files, builds prompts, calls Gemini, and parses JSON results.
- `chunkFiles(files, size)`
  Splits files into fixed-size groups.
- `cleanup()`
  Removes request temp directory.

### 3.4 `client/src/App.tsx`

Responsibilities:

- Hold all UI state for extraction workflow
- Open SSE request using `EventSource`
- Render logs, error states, and extracted API cards
- Toggle detailed schema display per API

State variables:

- `repoUrl: string`
- `selectedModel: string`
- `customApiKey: string`
- `logs: string[]`
- `apis: ApiEndpoint[]`
- `isExtracting: boolean`
- `error: string | null`
- `extractionCompleted: boolean`
- `terminalRef: RefObject<HTMLDivElement>`

Derived state:

- `isPaidModel`

UI substructure:

- Header section
- Left panel:
  configuration form, error banner, terminal log panel
- Right panel:
  empty state, no-results state, or extracted API list

### 3.5 `client/src/main.tsx`

Responsibilities:

- Bootstrap React root
- Mount `App`
- Import global stylesheet

## 4. Data Structures

### 4.1 `ApiEndpoint`

Used in both backend and frontend in structurally similar form.

```ts
interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  requestSchema?: any;
  responseSchema?: any;
}
```

Observations:

- No shared type package exists between client and server.
- `requestSchema` and `responseSchema` are untyped (`any`), reflecting LLM output variability.

## 5. Detailed Runtime Flow

### 5.1 Client-Side Flow

1. User enters repository URL.
2. User optionally selects a different Gemini model.
3. For paid models, UI optionally captures a custom API key.
4. User clicks `Start Extraction`.
5. UI resets prior state and opens `EventSource` to `/api/extract`.
6. Incoming SSE payloads are parsed as JSON:
   - `log` appends terminal output
   - `result` replaces `apis`
   - `error` updates error state and terminal logs
7. `close` event marks extraction complete.
8. `onerror` closes the stream and produces a generic failure message if no earlier error was received.

### 5.2 Server-Side Flow

1. Route handler reads query parameters.
2. Handler validates `repoUrl`.
3. Response headers are switched to SSE mode.
4. `AIAgent` instance is created with random session ID.
5. Handler calls `agent.run(...)`.
6. Progress callback converts internal log strings to SSE `log` events.
7. Final array is emitted as `result`.
8. Errors are serialized as `error`.
9. Response ends with `close` event.

### 5.3 Agent Execution Flow

1. Determine effective API key:
   - request override
   - environment fallback
2. Create Google GenAI client.
3. Clone/download repository into `os.tmpdir()`.
4. Recursively walk repository tree.
5. Ignore known heavy directories such as `node_modules`, `.git`, `dist`, `build`, `.next`, `.turbo`.
6. Keep only files that:
   - have supported extension: `.ts`, `.js`, `.py`, `.go`, `.java`, `.php`, `.rb`
   - are not test/spec/e2e files
   - look API-related by path/name heuristic
7. Chunk selected files into groups of 30.
8. For each chunk:
   - read file contents synchronously
   - build a plain-text extraction prompt
   - call `ai.models.generateContent(...)`
   - strip Markdown fences
   - `JSON.parse(...)`
   - append results
9. Remove temp directory.
10. Return aggregate API list.

## 6. Repository Retrieval Logic

### GitHub path

- `parseGithubRepo()` validates hostname contains `github.com`
- metadata fetch to `https://api.github.com/repos/:owner/:repo`
- use `default_branch` if available, otherwise assume `main`
- download zipball from `codeload.github.com`
- if branch zip fetch fails, retry with `master`
- extract archive into a staging directory

### Non-GitHub path

- use `simpleGit().clone(url, repoPath, ["--depth", "1"])`

## 7. File Selection Heuristics

The file scanner attempts to reduce token usage by selecting only likely API-related files.

Supported file extensions:

- `.ts`
- `.js`
- `.py`
- `.go`
- `.java`
- `.php`
- `.rb`

File/path indicators:

- contains `route`
- contains `controller`
- contains `service`
- contains `model`
- contains `api`
- exact filename `server.ts`
- exact filename `app.ts`
- exact filename `main.ts`
- exact filename `index.ts`

Exclusions:

- filenames containing `.test.`
- filenames containing `.spec.`
- paths containing `/test/`
- paths containing `/e2e/`

## 8. Prompt Construction

Each chunk is converted into a prompt that:

- asks for all API endpoints
- requests method, path, description, request schema, response schema
- references auto-generated REST patterns like `finale-rest`
- demands JSON-array-only output

Prompt context format:

```text
File: relative/path
Content:
<full file contents>
```

Chunk sections are concatenated with `---`.

## 9. Error Handling

### Handled cases

- Missing repository URL returns HTTP 400
- Missing API key raises error before repository analysis
- SSE write failures in `src/server.ts` are swallowed to tolerate disconnects
- Quota/rate limit messages in `analyzeFiles()` are re-thrown to the caller

### Weak spots

- Non-rate-limit model or JSON parsing failures are logged and skipped, leading to partial results
- Cleanup is not guaranteed if `run()` throws before `cleanup()`
- Server and Vercel handlers duplicate behavior, increasing divergence risk

## 10. Concurrency Model

- Each request creates an isolated `AIAgent` instance with its own temp directory.
- Chunk processing is sequential.
- The UI assumes a single active extraction in the page state.
- There is no job queue, lock management, or concurrency throttling for outbound LLM requests.

## 11. Configuration

Environment variables:

- `GOOGLE_API_KEY`
- `PORT` for local server
- `VERCEL` for runtime behavior gating

Build/runtime scripts:

- root `npm run dev`
- root `npm run build`
- root `npm run server`
- client `npm run dev`
- client `npm run build`

## 12. Technical Debt Summary

- Shared contracts are duplicated instead of centralized.
- Extraction logic is concentrated in one class with mixed responsibilities.
- Synchronous file I/O can become expensive for large repositories.
- Security posture is minimal for user-supplied inputs and credentials.
- No tests exist for the critical request path.
