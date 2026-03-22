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

const App: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [customApiKey, setCustomApiKey] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [apis, setApis] = useState<ApiEndpoint[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionCompleted, setExtractionCompleted] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleExtract = () => {
    setIsExtracting(true);
    setExtractionCompleted(false);
    setLogs(['Starting extraction...']);
    setApis([]);
    setError(null);

    const params = new URLSearchParams({
      url: repoUrl,
      model: selectedModel,
      apiKey: customApiKey,
    });

    const eventSource = new EventSource(`/api/extract?${params.toString()}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
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
      }
    };

    eventSource.addEventListener('close', () => {
      eventSource.close();
      setIsExtracting(false);
      setExtractionCompleted(true);
      setLogs((prev) => [...prev, 'Extraction complete.']);
    });

    eventSource.onerror = () => {
      eventSource.close();
      setIsExtracting(false);
    };
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

const ApiCard: React.FC<{ api: ApiEndpoint }> = ({ api }) => {
  const [isOpen, setIsOpen] = useState(false);

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
