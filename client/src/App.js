import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect, useRef } from 'react';
const MODELS = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Free)', type: 'free' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Paid/Adv)', type: 'paid' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Paid/Adv)', type: 'paid' },
    { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Exp (Adv)', type: 'paid' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Paid/Adv)', type: 'paid' },
];
const App = () => {
    const [repoUrl, setRepoUrl] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[0]?.id ?? 'gemini-3-flash-preview');
    const [customApiKey, setCustomApiKey] = useState('');
    const [logs, setLogs] = useState([]);
    const [apis, setApis] = useState([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState(null);
    const [extractionCompleted, setExtractionCompleted] = useState(false);
    const terminalRef = useRef(null);
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
            }
            else if (data.type === 'result') {
                setApis(data.data);
            }
            else if (data.type === 'error') {
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
            setExtractionCompleted(true);
            setError((prev) => {
                if (prev)
                    return prev;
                return 'Connection lost (timeout, rate limit, or network). If you hit API limits, wait or add a key; on Vercel, long runs may need a higher function duration.';
            });
            setLogs((prev) => {
                if (prev.some((l) => l.startsWith('ERROR:')))
                    return prev;
                return [...prev, 'ERROR: Connection to server ended unexpectedly.'];
            });
        };
    };
    const isPaidModel = MODELS.find(m => m.id === selectedModel)?.type === 'paid';
    return (_jsxs("div", { className: "container", children: [_jsxs("header", { children: [_jsx("h1", { children: "API Extract AI Agent" }), _jsx("p", { children: "Analyze GitHub repositories and extract API structures using Advanced LLMs" })] }), _jsxs("main", { className: "layout-container", children: [_jsxs("div", { className: "left-panel", children: [_jsxs("div", { className: "config-section", children: [_jsxs("div", { className: "input-group", children: [_jsx("label", { children: "GitHub Repository URL" }), _jsx("input", { type: "text", value: repoUrl, onChange: (e) => setRepoUrl(e.target.value), placeholder: "https://github.com/user/repo", disabled: isExtracting })] }), _jsxs("div", { className: "input-group", children: [_jsx("label", { children: "Select AI Model" }), _jsx("select", { value: selectedModel, onChange: (e) => setSelectedModel(e.target.value), disabled: isExtracting, children: MODELS.map(model => (_jsx("option", { value: model.id, children: model.name }, model.id))) })] }), isPaidModel && (_jsxs("div", { className: "input-group", children: [_jsx("label", { children: "Custom API Key (Optional override)" }), _jsx("input", { type: "password", value: customApiKey, onChange: (e) => setCustomApiKey(e.target.value), placeholder: "Enter your Google API Key", disabled: isExtracting })] })), _jsx("button", { className: "extract-button", onClick: handleExtract, disabled: isExtracting || !repoUrl, children: isExtracting ? 'Extracting...' : 'Start Extraction' })] }), error && _jsx("div", { className: "error-message", children: error }), _jsxs("div", { className: "terminal", ref: terminalRef, children: [logs.map((log, index) => (_jsxs("div", { className: "log-line", children: [_jsx("span", { className: "prompt", children: "$" }), " ", log] }, index))), isExtracting && _jsx("div", { className: "cursor", children: "_" })] })] }), _jsxs("div", { className: "right-panel", children: [extractionCompleted && apis.length === 0 && !error && (_jsx("div", { className: "no-results", children: "No APIs found in this repository." })), apis.length > 0 && (_jsxs("div", { className: "results-section", children: [_jsxs("h2", { children: ["Extracted APIs (", apis.length, ")"] }), _jsx("div", { className: "api-list", children: apis.map((api, index) => (_jsx(ApiCard, { api: api }, index))) })] })), !extractionCompleted && apis.length === 0 && (_jsx("div", { className: "empty-state", children: "Results will appear here after extraction." }))] })] })] }));
};
const ApiCard = ({ api }) => {
    const [isOpen, setIsOpen] = useState(false);
    const getMethodClass = (method) => {
        const m = method?.toUpperCase() || 'GET';
        if (m === 'GET')
            return 'method-get';
        if (m === 'POST')
            return 'method-post';
        if (m === 'PUT')
            return 'method-put';
        if (m === 'DELETE')
            return 'method-delete';
        return 'method-other';
    };
    return (_jsxs("div", { className: `api-card ${isOpen ? 'open' : ''}`, children: [_jsxs("div", { className: "api-card-header", onClick: () => setIsOpen(!isOpen), children: [_jsx("span", { className: `method ${getMethodClass(api.method)}`, children: api.method || 'GET' }), _jsx("span", { className: "path", children: api.path }), _jsx("span", { className: "description", children: api.description }), _jsx("span", { className: "chevron", children: isOpen ? '▲' : '▼' })] }), isOpen && (_jsxs("div", { className: "api-card-body", children: [_jsxs("div", { className: "schema-section", children: [_jsx("h4", { children: "Request Schema" }), _jsx("pre", { children: JSON.stringify(api.requestSchema || {}, null, 2) })] }), _jsxs("div", { className: "schema-section", children: [_jsx("h4", { children: "Response Schema" }), _jsx("pre", { children: JSON.stringify(api.responseSchema || {}, null, 2) })] })] }))] }));
};
export default App;
//# sourceMappingURL=App.js.map