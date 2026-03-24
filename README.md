# API Extract AI Agent

This is an autonomous AI agent that extracts API endpoints and their associated request/response schemas from a GitHub repository.

## Features
- Clones a GitHub repository locally.
- Scans for API routes, models, and server configuration files.
- Uses Google Gemini 3 Flash Preview to analyze the source code and extract structured API data.
- Outputs a comprehensive JSON file containing the extracted APIs and schemas.

## Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A Google Generative AI API Key (Get one from [Google AI Studio](https://aistudio.google.com/app/apikey))

## Setup
1. Clone this repository (the one containing this README).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and add your Google API key:
   ```env
   GOOGLE_API_KEY=your_api_key_here
   ```

## Usage

### Web Interface (Recommended)
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:5173](http://localhost:5173) in your browser.
3. Enter a GitHub URL and click "Start Extraction".
4. Watch the real-time terminal logs and view the results in the interactive list.

### CLI Interface
You can still run the agent via CLI:
```bash
npm run server -- https://github.com/juice-shop/juice-shop
```
*(Note: You'll need to update `src/server.ts` to handle CLI arguments if you want to use it this way, but the web interface is now the primary method.)*

## Output
The agent will generate a file named `extracted_apis.json` in the project root with the following structure:
```json
[
  {
    "method": "POST",
    "path": "/api/Users",
    "description": "Registers a new user",
    "requestSchema": { ... },
    "responseSchema": { ... }
  },
  ...
]
```

## How it works
The agent uses a chunking strategy to send source code files to the LLM. It identifies key patterns like Express.js route registrations and Sequelize models to infer both manual and automatically generated (via `finale-rest`) endpoints.

## Deployment

This repo is aligned for static frontend hosting plus a separate Node backend.

### Recommended setup: Netlify + Render

Use one GitHub repo and deploy the two parts separately:

- Netlify for the frontend from `client/`
- Render for the backend from the repo root

### Netlify frontend

- Base directory: `client`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variable:
  ```env
  VITE_API_BASE_URL=https://your-render-service.onrender.com
  ```

### Render backend

- Root directory: repository root
- Build command: `npm install`
- Start command:
  ```bash
  node --import tsx src/server.ts
  ```
- Environment variable:
  ```env
  GOOGLE_API_KEY=your_api_key_here
  ```

### Local development

For local development, you can keep using the Vite proxy with no frontend API base URL set, or create `client/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:3001
```

An example file is provided at `client/.env.example`.
