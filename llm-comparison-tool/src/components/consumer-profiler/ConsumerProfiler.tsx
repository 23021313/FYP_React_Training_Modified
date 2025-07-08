import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import llmService from '../../services/shared/llmService';

const LOCAL_STORAGE_KEY = "consumer_prompts_history";
const DEFAULT_RALLY_CONSUMER_PROMPT = `You are Rally AI, an expert in consumer profiling. Given the following consumer data, generate a detailed profile including demographics, preferences, and actionable insights.\n\n{CONSUMER_DATA}`;

interface ConsumerData {
    [key: string]: string | number;
}

interface PromptHistoryItem {
    prompt: string;
    tokens: number;
    cost: number;
    responseTime: number;
    success: boolean;
    timestamp: number;
}

const ConsumerProfiler: React.FC = () => {
    const [consumerData, setConsumerData] = useState<ConsumerData[]>([]);
    const [prompts, setPrompts] = useState<string[]>([]);
    const [currentPrompt, setCurrentPrompt] = useState<string>("");
    const [customPrompt, setCustomPrompt] = useState<string>("");
    const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>([]);
    const [isTesting, setIsTesting] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<string>("");
    const [csvPreview, setCsvPreview] = useState<ConsumerData[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Load prompts and prompt history from localStorage on mount
    useEffect(() => {
        const storedPrompts = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedPrompts) {
            setPromptHistory(JSON.parse(storedPrompts));
        }
        setCurrentPrompt(DEFAULT_RALLY_CONSUMER_PROMPT);
    }, []);

    // Save prompt history to localStorage when changed
    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(promptHistory));
    }, [promptHistory]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = evt.target?.result;
            if (!data) return;
            const workbook = XLSX.read(data, { type: "binary" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData: ConsumerData[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            setCsvPreview(jsonData); // Show uploaded data in preview area
        };
        reader.readAsBinaryString(file);
    };

    // Custom prompt creation interface
    const handleCustomPromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomPrompt(e.target.value);
    };

    const handleSetCustomPrompt = () => {
        if (customPrompt.trim()) {
            setCurrentPrompt(customPrompt.trim());
            setCustomPrompt("");
        }
    };

    // Helper to format Excel data as a readable text table for prompt injection
    const formatConsumerData = (data: ConsumerData[]) => {
        if (!data.length) return "";
        const headers = Object.keys(data[0]);
        // Create a markdown-like table for better readability
        const headerRow = headers.join(" | ");
        const separatorRow = headers.map(() => "---").join(" | ");
        const dataRows = data.map(row =>
            headers.map(h => String(row[h] ?? "")).join(" | ")
        );
        return [headerRow, separatorRow, ...dataRows].join("\n");
    };

    // Replace {CONSUMER_DATA} in prompt with actual data
    const injectConsumerData = (prompt: string, data: ConsumerData[]) => {
        return prompt.replace("{CONSUMER_DATA}", formatConsumerData(data));
    };

    // Test prompt using llmService and update stats/results
    const handleTestPrompt = async () => {
        if (!currentPrompt.trim() || consumerData.length === 0) return;
        setIsTesting(true);
        setAnalysisResult("");
        const promptWithData = injectConsumerData(currentPrompt, consumerData);

        const start = Date.now();
        try {
            // Send prompt to LLM service
            const response = await llmService.service.sendPrompt(promptWithData);
            const responseTime = Date.now() - start;

            // Get usage statistics (tokens, cost, etc.)
            let usage = { tokens: 0, cost: 0 };
            if (llmService.service.getUsage) {
                try {
                    const rawUsage = await llmService.service.getUsage();
                    usage = {
                        tokens: typeof rawUsage.tokens === "number" ? rawUsage.tokens : Number(rawUsage.tokens) || 0,
                        cost: typeof rawUsage.cost === "number" ? rawUsage.cost : Number(rawUsage.cost) || 0,
                    };
                } catch {
                    usage = { tokens: 0, cost: 0 };
                }
            }

            // Extract content from LLM response based on provider
            let content = "";
            if (response) {
                // Try OpenAI format
                if (response.choices?.[0]?.message?.content) {
                    content = response.choices[0].message.content;
                }
                // Try Gemini format
                else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                    content = response.candidates[0].content.parts[0].text;
                }
                // Try Gemini alternate format
                else if (response.candidates?.[0]?.content?.parts?.[0]) {
                    content = response.candidates[0].content.parts[0];
                }
                // Try Anthropic Claude format
                else if (response.completion) {
                    content = response.completion;
                }
                // Try generic result field
                else if (typeof response.result === "string") {
                    content = response.result;
                }
                // Try direct string response
                else if (typeof response === "string") {
                    content = response;
                }
            }

            // Remove leading/trailing whitespace and check for empty
            content = (content ?? "").toString().trim();
            if (!content) {
                content = "No analysis result returned.";
            }

            setAnalysisResult(content);

            const item: PromptHistoryItem = {
                prompt: currentPrompt,
                tokens: usage.tokens ?? 0,
                cost: usage.cost ?? 0,
                responseTime,
                success: !!content && content !== "No analysis result returned.",
                timestamp: Date.now(),
            };
            setPromptHistory([item, ...promptHistory]);
        } catch (err) {
            setAnalysisResult("Error: Unable to get analysis from LLM service.");
            const responseTime = Date.now() - start;
            const item: PromptHistoryItem = {
                prompt: currentPrompt,
                tokens: 0,
                cost: 0,
                responseTime,
                success: false,
                timestamp: Date.now(),
            };
            setPromptHistory([item, ...promptHistory]);
        }
        setIsTesting(false);
    };

    const handleRemovePromptHistory = (idx: number) => {
        setPromptHistory(promptHistory.filter((_, i) => i !== idx));
    };

    // Success rate calculation
    const successRate = promptHistory.length
        ? ((promptHistory.filter(h => h.success).length / promptHistory.length) * 100).toFixed(1)
        : "0";

    return (
        <div style={{ padding: 32, maxWidth: 900, margin: "0 auto", fontFamily: "Segoe UI, Arial, sans-serif" }}>
            <h2 style={{ textAlign: "center", marginBottom: 32 }}>Consumer Profiler</h2>

            {/* Excel Upload */}
            <div style={{
                marginBottom: 32,
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "#f8fafc",
                padding: 20,
                borderRadius: 8,
                boxShadow: "0 1px 4px #e0e7ef"
            }}>
                <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "10px 20px",
                        cursor: "pointer",
                        fontWeight: 500
                    }}
                >
                    Upload Excel/CSV File
                </button>
                <span style={{ color: "#64748b" }}>
                    {csvPreview.length > 0
                        ? `Loaded ${csvPreview.length} records`
                        : "No file uploaded"}
                </span>
            </div>

            {/* CSV Preview Area */}
            {csvPreview.length > 0 && (
                <div style={{
                    overflowX: "auto",
                    marginBottom: 32,
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 4px #e0e7ef",
                    padding: 16
                }}>
                    <h4 style={{ marginTop: 0 }}>Uploaded Data Preview</h4>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead>
                            <tr>
                                {Object.keys(csvPreview[0]).map((key) => (
                                    <th key={key} style={{
                                        background: "#f1f5f9",
                                        padding: 8,
                                        border: "1px solid #e2e8f0",
                                        fontWeight: 600
                                    }}>{key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {csvPreview.map((row, idx) => (
                                <tr key={idx} style={{ background: idx % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                    {Object.keys(csvPreview[0]).map((key) => (
                                        <td key={key} style={{
                                            padding: 8,
                                            border: "1px solid #e2e8f0"
                                        }}>{row[key]}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Default Prompt and Custom Prompt Creation */}
            <div style={{
                marginBottom: 24,
                background: "#f8fafc",
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 1px 4px #e0e7ef"
            }}>
                <div style={{ marginBottom: 8 }}>
                    <strong>Default Rally AI Consumer Profiling Prompt:</strong>
                    <pre style={{
                        background: "#f1f5f9",
                        padding: 10,
                        borderRadius: 4,
                        marginTop: 6,
                        fontSize: 14,
                        whiteSpace: "pre-wrap"
                    }}>{DEFAULT_RALLY_CONSUMER_PROMPT}</pre>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                        type="text"
                        value={customPrompt}
                        onChange={handleCustomPromptChange}
                        placeholder="Create custom prompt"
                        style={{
                            flex: 1,
                            padding: 8,
                            borderRadius: 4,
                            border: "1px solid #cbd5e1",
                            fontSize: 15
                        }}
                    />
                    <button
                        onClick={handleSetCustomPrompt}
                        style={{
                            background: "#22c55e",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            padding: "8px 16px",
                            fontWeight: 500,
                            cursor: "pointer"
                        }}
                    >
                        Set as Current Prompt
                    </button>
                </div>
            </div>

            {/* Prompt Testing and History */}
            <div style={{
                background: "#f8fafc",
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 1px 4px #e0e7ef"
            }}>
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Prompt Testing</h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <textarea
                        value={currentPrompt}
                        onChange={e => setCurrentPrompt(e.target.value)}
                        placeholder="Enter or edit prompt"
                        style={{
                            flex: 1,
                            minHeight: 60,
                            padding: 8,
                            borderRadius: 4,
                            border: "1px solid #cbd5e1",
                            fontSize: 15
                        }}
                    />
                    <button
                        onClick={handleTestPrompt}
                        disabled={isTesting || consumerData.length === 0}
                        style={{
                            background: isTesting ? "#94a3b8" : "#2563eb",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            padding: "10px 20px",
                            fontWeight: 500,
                            cursor: isTesting || consumerData.length === 0 ? "not-allowed" : "pointer"
                        }}
                        title={consumerData.length === 0 ? "Upload consumer data first" : ""}
                    >
                        {isTesting ? "Testing..." : "Test Prompt"}
                    </button>
                </div>
                {/* Analysis Result */}
                {analysisResult && (
                    <div style={{
                        background: "#fff",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        padding: 16,
                        marginBottom: 20,
                        fontSize: 15,
                        color: "#334155",
                        whiteSpace: "pre-wrap"
                    }}>
                        <strong>Analysis Result:</strong>
                        <div style={{ marginTop: 8 }}>{analysisResult}</div>
                    </div>
                )}
                {/* ...existing prompt history table... */}
                <h4 style={{ marginBottom: 8 }}>Prompt History</h4>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 12 }}>
                        <thead>
                            <tr>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Prompt</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Tokens</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Cost ($)</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Response Time (ms)</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Success</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Timestamp</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            {promptHistory.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: "center", color: "#64748b", padding: 12 }}>
                                        No prompt history yet.
                                    </td>
                                </tr>
                            )}
                            {promptHistory.map((item, idx) => (
                                <tr key={idx} style={{ background: idx % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                    <td style={{ maxWidth: 250, wordBreak: "break-word", padding: 6, border: "1px solid #e2e8f0" }}>{item.prompt}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.tokens}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.cost}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.responseTime}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.success ? "✅" : "❌"}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{new Date(item.timestamp).toLocaleString()}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                                        <button
                                            onClick={() => handleRemovePromptHistory(idx)}
                                            style={{
                                                background: "#ef4444",
                                                color: "#fff",
                                                border: "none",
                                                borderRadius: 4,
                                                padding: "4px 10px",
                                                fontWeight: 500,
                                                cursor: "pointer"
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ textAlign: "right", color: "#2563eb", fontWeight: 600 }}>
                    Success Rate: {successRate}%
                </div>
            </div>
        </div>
    );
};

export default ConsumerProfiler;
