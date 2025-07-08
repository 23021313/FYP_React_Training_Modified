import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from "pdfjs-dist";
import llmService from '../../services/shared/llmService';
 
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const LOCAL_STORAGE_KEY = "business_prompts_history";
const DEFAULT_BUSINESS_PROMPT = `You are Rally AI, an expert in business profiling. Given the following business data, generate a detailed profile including risks, opportunities, and actionable insights.\n\n{BUSINESS_DATA}`;

interface PromptHistoryItem {
    prompt: string;
    tokens: number;
    cost: number;
    responseTime: number;
    success: boolean;
    timestamp: number;
}

const BusinessProfiler: React.FC = () => {
    const [businessText, setBusinessText] = useState<string>("");
    const [currentPrompt, setCurrentPrompt] = useState<string>(DEFAULT_BUSINESS_PROMPT);
    const [customPrompt, setCustomPrompt] = useState<string>("");
    const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>([]);
    const [isTesting, setIsTesting] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Load prompt history from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) setPromptHistory(JSON.parse(stored));
        setCurrentPrompt(DEFAULT_BUSINESS_PROMPT);
    }, []);

    // Save prompt history to localStorage when changed
    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(promptHistory));
    }, [promptHistory]);

    // PDF Upload and Extraction
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const typedarray = new Uint8Array(evt.target?.result as ArrayBuffer);
            try {
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let text = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map((item: any) => item.str).join(" ") + "\n";
                }
                setBusinessText(text.trim());
            } catch (err) {
                setBusinessText("");
                alert("Failed to parse PDF. Please upload a valid PDF file.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleCustomPromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomPrompt(e.target.value);
    };

    const handleSetCustomPrompt = () => {
        if (customPrompt.trim()) {
            setCurrentPrompt(customPrompt.trim());
            setCustomPrompt("");
        }
    };

    // Replace {BUSINESS_DATA} in prompt with extracted PDF text
    const injectBusinessData = (prompt: string, data: string) => {
        return prompt.replace("{BUSINESS_DATA}", data);
    };

    // Test prompt using llmService and update stats/results
    const handleTestPrompt = async () => {
        if (!currentPrompt.trim() || !businessText.trim()) return;
        setIsTesting(true);
        setAnalysisResult("");
        const promptWithData = injectBusinessData(currentPrompt, businessText);

        const start = Date.now();
        try {
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
                if (response.choices?.[0]?.message?.content) {
                    content = response.choices[0].message.content;
                } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
                    content = response.candidates[0].content.parts[0].text;
                } else if (response.candidates?.[0]?.content?.parts?.[0]) {
                    content = response.candidates[0].content.parts[0];
                } else if (response.completion) {
                    content = response.completion;
                } else if (typeof response.result === "string") {
                    content = response.result;
                } else if (typeof response === "string") {
                    content = response;
                }
            }
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
            <h2 style={{ textAlign: "center", marginBottom: 32 }}>Business Profiler</h2>

            {/* PDF Upload */}
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
                    accept=".pdf"
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
                    Upload PDF File
                </button>
                <span style={{ color: "#64748b" }}>
                    {businessText
                        ? `PDF loaded (${businessText.length} characters)`
                        : "No file uploaded"}
                </span>
            </div>

            {/* PDF Text Preview */}
            {businessText && (
                <div style={{
                    overflowX: "auto",
                    marginBottom: 32,
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 4px #e0e7ef",
                    padding: 16,
                    maxHeight: 250,
                    whiteSpace: "pre-wrap"
                }}>
                    <h4 style={{ marginTop: 0 }}>Extracted Business Data Preview</h4>
                    <div style={{ fontSize: 14, color: "#334155" }}>
                        {businessText.slice(0, 2000)}
                        {businessText.length > 2000 && <span>... (truncated)</span>}
                    </div>
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
                    <strong>Default Rally AI Business Profiling Prompt:</strong>
                    <pre style={{
                        background: "#f1f5f9",
                        padding: 10,
                        borderRadius: 4,
                        marginTop: 6,
                        fontSize: 14,
                        whiteSpace: "pre-wrap"
                    }}>{DEFAULT_BUSINESS_PROMPT}</pre>
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
                        disabled={isTesting || !businessText}
                        style={{
                            background: isTesting ? "#94a3b8" : "#2563eb",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            padding: "10px 20px",
                            fontWeight: 500,
                            cursor: isTesting || !businessText ? "not-allowed" : "pointer"
                        }}
                        title={!businessText ? "Upload business PDF first" : ""}
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
                {/* Prompt History */}
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

export default BusinessProfiler;