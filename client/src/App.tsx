import React, { useState, useEffect, useRef } from 'react';

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  requestSchema?: any;
  responseSchema?: any;
}

const MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Free)', type: 'free' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Paid/Adv)', type: 'paid' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Paid/Adv)', type: 'paid' },
  { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Exp (Adv)', type: 'paid' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Paid/Adv)', type: 'paid' },
];

// Resolves the API origin for local proxy usage or a separately hosted backend in production.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// Builds an absolute or relative API path without leaving duplicate slashes.
const getApiUrl = (path: string) => `${API_BASE_URL}${path}`;

const App: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    MODELS[0]?.id ?? 'gemini-3-flash-preview',
  );
  const [customApiKey, setCustomApiKey] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [apis, setApis] = useState<ApiEndpoint[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionCompleted, setExtractionCompleted] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Keeps the log panel pinned to the latest streamed message.
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Parses streamed SSE-style chunks from fetch and returns complete event payload strings.
  const parseSseMessages = (chunk: string, carry: string) => {
    const buffer = `${carry}${chunk}`;
    const parts = buffer.split('\n\n');
    const nextCarry = parts.pop() ?? '';
    const messages = parts
      .map((part) =>
        part
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n'),
      )
      .filter(Boolean);

    return { messages, carry: nextCarry };
  };

  // Starts one extraction run and wires the streamed backend response into the UI state model.
  const handleExtract = async () => {
    setIsExtracting(true);
    setExtractionCompleted(false);
    setLogs(['Starting extraction...']);
    setApis([]);
    setError(null);

    try {
      const response = await fetch(getApiUrl('/api/extract'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          url: repoUrl,
          model: selectedModel,
          apiKey: customApiKey || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let carry = '';
      let didReceiveTerminalEvent = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const { messages, carry: nextCarry } = parseSseMessages(decoder.decode(value, { stream: true }), carry);
        carry = nextCarry;

        for (const message of messages) {
          if (message === 'close') {
            didReceiveTerminalEvent = true;
            continue;
          }

          const data = JSON.parse(message);
          if (data.type === 'log') {
            setLogs((prev) => [...prev, data.message]);
          } else if (data.type === 'result') {
            setApis(data.data);
          } else if (data.type === 'error') {
            let errorMsg = data.message;
            if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit')) {
              errorMsg = "Free API limit reached or not working. Please come back tomorrow or provide a paid API key for advanced models.";
            }
            setError(errorMsg);
            setLogs((prev) => [...prev, `ERROR: ${errorMsg}`]);
            didReceiveTerminalEvent = true;
          }
        }
      }

      if (!didReceiveTerminalEvent && carry.trim() && carry.includes('data:')) {
        const { messages } = parseSseMessages('\n\n', carry);
        for (const message of messages) {
          if (message === 'close') continue;
          const data = JSON.parse(message);
          if (data.type === 'result') {
            setApis(data.data);
          } else if (data.type === 'error') {
            setError(data.message);
            setLogs((prev) => [...prev, `ERROR: ${data.message}`]);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection lost (timeout, rate limit, or network). If you hit API limits, wait or add a key.';
      setError((prev) => prev ?? message);
      setLogs((prev) => {
        if (prev.some((line) => line.startsWith('ERROR:'))) return prev;
        return [...prev, `ERROR: ${message}`];
      });
    } finally {
      setIsExtracting(false);
      setExtractionCompleted(true);
      setLogs((prev) => [...prev, 'Extraction complete.']);
    }
  };

  const isPaidModel = MODELS.find(m => m.id === selectedModel)?.type === 'paid';

  return (
    <div className="container">
      <header>
        <h1>API Extract AI Agent</h1>
        <p>Analyze GitHub repositories and extract API structures using Advanced LLMs</p>
      </header>

      <main className="layout-container">
        <div className="left-panel">
          <div className="config-section">
            <div className="input-group">
              <label>GitHub Repository URL</label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                disabled={isExtracting}
              />
            </div>

            <div className="input-group">
              <label>Select AI Model</label>
              <select 
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isExtracting}
              >
                {MODELS.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>

            {isPaidModel && (
              <div className="input-group">
                <label>Custom API Key (Optional override)</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="Enter your Google API Key"
                  disabled={isExtracting}
                />
              </div>
            )}

            <button 
              className="extract-button"
              onClick={handleExtract} 
              disabled={isExtracting || !repoUrl}
            >
              {isExtracting ? 'Extracting...' : 'Start Extraction'}
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="terminal" ref={terminalRef}>
            {logs.map((log, index) => (
              <div key={index} className="log-line">
                <span className="prompt">$</span> {log}
              </div>
            ))}
            {isExtracting && <div className="cursor">_</div>}
          </div>
        </div>

        <div className="right-panel">
          {extractionCompleted && apis.length === 0 && !error && (
            <div className="no-results">
              No APIs found in this repository.
            </div>
          )}

          {apis.length > 0 && (
            <div className="results-section">
              <h2>Extracted APIs ({apis.length})</h2>
              <div className="api-list">
                {apis.map((api, index) => (
                  <ApiCard key={index} api={api} />
                ))}
              </div>
            </div>
          )}
          
          {!extractionCompleted && apis.length === 0 && (
            <div className="empty-state">
              Results will appear here after extraction.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Renders one extracted endpoint and lets the user expand its schemas.
const ApiCard: React.FC<{ api: ApiEndpoint }> = ({ api }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Maps HTTP verbs to the CSS badge variant used in the results list.
  const getMethodClass = (method: string) => {
    const m = method?.toUpperCase() || 'GET';
    if (m === 'GET') return 'method-get';
    if (m === 'POST') return 'method-post';
    if (m === 'PUT') return 'method-put';
    if (m === 'DELETE') return 'method-delete';
    return 'method-other';
  };

  return (
    <div className={`api-card ${isOpen ? 'open' : ''}`}>
      <div className="api-card-header" onClick={() => setIsOpen(!isOpen)}>
        <span className={`method ${getMethodClass(api.method)}`}>{api.method || 'GET'}</span>
        <span className="path">{api.path}</span>
        <span className="description">{api.description}</span>
        <span className="chevron">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="api-card-body">
          <div className="schema-section">
            <h4>Request Schema</h4>
            <pre>{JSON.stringify(api.requestSchema || {}, null, 2)}</pre>
          </div>
          <div className="schema-section">
            <h4>Response Schema</h4>
            <pre>{JSON.stringify(api.responseSchema || {}, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
