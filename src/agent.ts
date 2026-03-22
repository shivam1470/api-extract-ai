import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import { simpleGit } from "simple-git";
import * as dotenv from "dotenv";
import { fileURLToPath } from 'url';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading .env from multiple locations
const envPath = path.resolve(process.cwd(), '.env');
const envPathRoot = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (fs.existsSync(envPathRoot)) {
  dotenv.config({ path: envPathRoot });
} else {
  dotenv.config();
}

const DEFAULT_API_KEY = process.env.GOOGLE_API_KEY;

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  requestSchema?: any;
  responseSchema?: any;
}

class AIAgent {
  private repoPath: string;

  constructor(private sessionId: string = "default") {
    this.repoPath = path.join(os.tmpdir(), `api_extract_ai_${sessionId}`);
  }

  async run(githubUrl: string, onLog: (msg: string) => void, modelId: string = "gemini-3-flash-preview", customApiKey?: string) {
    const apiKey = customApiKey || DEFAULT_API_KEY;
    
    if (!apiKey) {
      onLog("Error: API Key is not set. Please provide one for advanced models or set GOOGLE_API_KEY in .env.");
      throw new Error("API Key is not set.");
    }

    const ai = new GoogleGenAI({ apiKey });

    onLog(`Cloning repository: ${githubUrl}...`);
    await this.cloneRepo(githubUrl);

    onLog("Scanning files...");
    const files = this.scanFiles(this.repoPath);
    onLog(`Found ${files.length} relevant files.`);

    onLog(`Analyzing APIs using ${modelId}...`);
    const apis = await this.analyzeFiles(files, onLog, ai, modelId);

    onLog(`Successfully extracted ${apis.length} APIs.`);
    
    this.cleanup();
    return apis;
  }

  private async cloneRepo(url: string) {
    if (fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
    await simpleGit().clone(url, this.repoPath, ["--depth", "1"]);
  }

  private scanFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const skipDirs = ["node_modules", ".git", "dist", "build", ".next", ".turbo"];
        if (!skipDirs.includes(file)) {
          this.scanFiles(filePath, fileList);
        }
      } else {
        const ext = path.extname(file).toLowerCase();
        const relevantExtensions = [".ts", ".js", ".py", ".go", ".java", ".php", ".rb"];
        
        const isSourceFile = relevantExtensions.includes(ext);
        const isNotTest = !file.includes(".test.") && !file.includes(".spec.") && !filePath.includes("/test/") && !filePath.includes("/e2e/");
        
        if (isSourceFile && isNotTest) {
          const isLikelyApiFile = 
            filePath.includes("route") || 
            filePath.includes("controller") || 
            filePath.includes("service") ||
            filePath.includes("model") ||
            filePath.includes("api") ||
            file === "server.ts" || 
            file === "app.ts" ||
            file === "main.ts" ||
            file === "index.ts";

          if (isLikelyApiFile) {
            fileList.push(filePath);
          }
        }
      }
    }
    return fileList;
  }

  private async analyzeFiles(files: string[], onLog: (msg: string) => void, ai: any, modelId: string): Promise<ApiEndpoint[]> {
    const allApis: ApiEndpoint[] = [];
    const chunks = this.chunkFiles(files, 30);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      onLog(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} files)...`);
      const context = chunk.map(f => {
        const content = fs.readFileSync(f, "utf-8");
        return `File: ${path.relative(this.repoPath, f)}\nContent:\n${content}\n`;
      }).join("\n---\n");

      const prompt = `
        Analyze the following source code files from a web application and extract all API endpoints.
        For each endpoint, provide:
        - HTTP Method (GET, POST, PUT, DELETE, etc.)
        - Path (e.g., /api/Users)
        - Brief description
        - Request Schema (JSON format or TypeScript interface)
        - Response Schema (JSON format or TypeScript interface)

        If the application uses a library like 'finale-rest' or 'sequelize' to auto-generate REST APIs from models, identify those as well.
        Usually, 'finale.resource({ model: UserModel, ... })' creates standard CRUD endpoints like GET, POST, PUT, DELETE for that model.

        Return the results as a JSON array of objects with the following keys: method, path, description, requestSchema, responseSchema.
        Only return the JSON array, no other text.

        Source Code:
        ${context}
      `;

      try {
        const response = await ai.models.generateContent({
          model: modelId,
          contents: prompt,
        });
        
        const text = response.text;
        const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const apis = JSON.parse(jsonText);
        allApis.push(...apis);
      } catch (error: any) {
        onLog(`Error analyzing chunk ${i + 1}: ${error.message}`);
        // If it's a quota error, we throw it to be caught by the server and sent to client
        if (error.message.includes('429') || error.message.toLowerCase().includes('quota')) {
          throw error;
        }
      }
    }

    return allApis;
  }

  private chunkFiles(files: string[], size: number): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += size) {
      chunks.push(files.slice(i, i + size));
    }
    return chunks;
  }

  private cleanup() {
    if (fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
  }
}

export { AIAgent, ApiEndpoint };
