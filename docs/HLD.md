# API Extract AI Agent: High-Level Design

## 1. Overview

`api-extract-ai` is a full-stack TypeScript application that accepts a repository URL, clones or downloads the repository, scans likely backend source files, submits grouped source code to a Gemini model, and returns extracted API metadata to the browser through Server-Sent Events (SSE).

The project is optimized for a lightweight interactive workflow rather than a batch platform. The current implementation handles one extraction request per browser session and keeps most state in memory for the lifetime of the request.

## 2. Goals

- Provide a simple web UI for API extraction from public repositories.
- Stream progress logs to the user while extraction is in flight.
- Support local development and Vercel deployment.
- Work without a system `git` install for GitHub repositories.

## 3. Non-Goals

- Persistent job storage or queueing.
- Authenticated multi-user access control.
- Deterministic static code analysis.
- Guaranteed complete API discovery across all frameworks and languages.

## 4. System Context

### External Actors

- End user in browser
- GitHub repository hosting
- Google Gemini API
- Vercel or local Node runtime

### External Dependencies

- `@google/genai` for model inference
- `simple-git` for non-GitHub repository cloning
- `adm-zip` for GitHub archive extraction
- `express`, `cors` for API hosting
- `react`, `vite` for UI delivery

## 5. High-Level Architecture

The system has three major layers:

1. Presentation layer
   The React/Vite client collects input, opens an SSE connection, renders live logs, and displays extracted endpoints.

2. Application/API layer
   Express or the Vercel handler accepts extraction requests, initializes `AIAgent`, and streams status and results as SSE events.

3. Extraction engine
   `AIAgent` downloads the target repository, scans files using heuristics, chunks file content, calls Gemini, parses structured JSON output, and returns accumulated endpoint metadata.

## 6. Component View

### Client

- `client/src/App.tsx`
  Handles user input, starts SSE extraction, manages UI state, and renders extracted APIs.
- `client/src/App.css`
  Provides layout and visual styling.

### Backend API

- `src/server.ts`
  Runs the local Express server, serves built frontend assets, and exposes SSE extraction endpoints for local or Vercel-routed requests.
- `src/api/extract.ts`
  Provides a dedicated Vercel serverless handler for `/api/extract`.

### Domain/Service Layer

- `src/agent.ts`
  Contains the end-to-end orchestration for repository retrieval, scanning, prompt generation, LLM invocation, parsing, and cleanup.

## 7. Request Lifecycle

1. User enters a repository URL and optional model/API key in the client.
2. Client opens `EventSource` against `/api/extract`.
3. API layer validates presence of the URL and starts SSE response headers.
4. API layer creates an `AIAgent` instance for the request.
5. `AIAgent` resolves credentials and prepares a temporary workspace.
6. Repository is downloaded:
   - GitHub repositories use GitHub metadata + zipball download.
   - Non-GitHub repositories use `simple-git clone --depth 1`.
7. Agent recursively scans for likely API-related source files.
8. Files are chunked in groups of 30 and serialized into prompt context.
9. Gemini is invoked per chunk.
10. Parsed API definitions are aggregated in memory.
11. Final results are streamed back over SSE.
12. Client closes the event stream and renders extracted endpoints.

## 8. Deployment View

### Local Development

- Backend runs via `tsx src/server.ts` on `127.0.0.1:3001`.
- Frontend runs via Vite dev server.
- Root `npm run dev` runs both concurrently.

### Vercel

- `src/api/extract.ts` runs as a Node serverless function.
- `client/` builds to static assets.
- `vercel.json` routes `/api/extract` to the function and all other paths to the built SPA.

## 9. Data Flow

### Input

- Repository URL
- Model identifier
- Optional API key override

### Internal Artifacts

- Temporary repository checkout/archive extraction under OS temp directory
- Filtered list of relevant source files
- Chunked prompt payloads
- Aggregated `ApiEndpoint[]`

### Output

SSE events of the form:

- `{"type":"log","message":"..."}`
- `{"type":"result","data":[...]}`
- `{"type":"error","message":"..."}`

## 10. Core Design Decisions

### SSE instead of polling

SSE is used to stream progress logs and final results over a single long-lived response. This keeps the UI simple and avoids introducing background jobs or a polling store.

### Heuristic file selection

The scanner prioritizes files that look API-related by name and extension. This reduces prompt size and token cost, but it also reduces recall for unconventional project structures.

### LLM-driven extraction

The system uses prompt-based extraction instead of framework-specific parsers. This keeps implementation small and language-agnostic, but accuracy depends on model behavior and prompt quality.

### GitHub zip download first

GitHub repositories are fetched by HTTP archive so the application can run in environments where the `git` binary is unavailable.

## 11. Scalability and Reliability Characteristics

- Stateless request processing at the HTTP layer
- In-memory aggregation only; no durable job store
- One long-running request per extraction
- Runtime cost grows with repository size and number of selected files
- LLM latency and rate limits are the main throughput bottlenecks
- Serverless timeout limits can terminate long scans on Vercel

## 12. Security Considerations

- User-supplied repository URLs are accepted directly by the backend.
- Optional API keys currently travel from browser to backend per request.
- Extracted repository contents are temporarily materialized on disk.
- No authentication, quota control, or origin restrictions beyond permissive CORS are implemented.

## 13. Known Limitations

- File discovery is heuristic and incomplete.
- API extraction can be partial or imprecise for large or unusual codebases.
- No deduplication or normalization of repeated endpoints.
- No persistence of outputs to database or object storage.
- No automated test suite currently protects critical paths.

## 14. Recommended Evolution

- Introduce a formal extraction pipeline with typed stages and structured error classes.
- Move long-running extraction to async jobs with persistent status storage.
- Replace query-string credential transport with a safer secret-handling approach.
- Add parser-assisted extraction for common frameworks before falling back to LLM inference.
- Add test coverage for scan, chunking, route handling, and SSE behaviors.
