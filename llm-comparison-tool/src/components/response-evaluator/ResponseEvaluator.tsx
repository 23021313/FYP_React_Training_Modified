import React, { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import llmService from '../../services/shared/llmService';
import PromptLogger from '../../services/shared/PromptLogger';

const LOCAL_STORAGE_KEY = "response_prompts_history";
const DEFAULT_EVALUATOR_PROMPT = `You are Rally AI, a market research assistant developed by Rally AI Pte. Ltd. Your role is to evaluate mystery shopper responses for usefulness and authenticity. Assess each answer’s usefulness (0–2) and authenticity (0–5), identify responses that require improvement, and provide concise, actionable feedback.`;

interface QAData {
    Question: string;
    Answer: string;
    [key: string]: string;
}

interface PromptHistoryItem {
    prompt: string;
    tokens: number;
    cost: number;
    responseTime: number;
    success: boolean;
    timestamp: number;
}

// Template system types and constants
type TemplateCategory = "all" | "business" | "consumer" | "evaluation";
interface PromptTemplate {
    id: string;
    name: string;
    category: Exclude<TemplateCategory, "all">;
    content: string;
    usage: number;
    lastUsed: number;
}
const TEMPLATE_STORAGE_KEY = "prompt_templates";
const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string }[] = [
    { key: "all", label: "All" },
    { key: "business", label: "Business" },
    { key: "consumer", label: "Consumer" },
    { key: "evaluation", label: "Evaluation" }
];

const PROVIDERS = [
    { name: "OpenAI", key: "openai" },
    { name: "Gemini", key: "gemini" }
];

const ResponseEvaluator: React.FC = () => {
    const [qaData, setQAData] = useState<QAData[]>([]);
    const [currentPrompt, setCurrentPrompt] = useState<string>(DEFAULT_EVALUATOR_PROMPT);
    const [customPrompt, setCustomPrompt] = useState<string>("");
    const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>([]);
    const [isTesting, setIsTesting] = useState(false);
    const [evaluationResult, setEvaluationResult] = useState<string>("");
    const [question, setQuestion] = useState<string>("");
    const [answer, setAnswer] = useState<string>("");
    const [csvPreview, setCsvPreview] = useState<QAData[]>([]);
    const [currentProvider, setCurrentProvider] = useState<string>(llmService.service?.provider || "openai");
    const [providerStats, setProviderStats] = useState<any>({});
    const [templates, setTemplates] = useState<PromptTemplate[]>([]);
    const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("evaluation");
    const [templateName, setTemplateName] = useState<string>("");
    const [templateContent, setTemplateContent] = useState<string>("");
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [templateSearch, setTemplateSearch] = useState<string>("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Load prompt history from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) setPromptHistory(JSON.parse(stored));
        setCurrentPrompt(DEFAULT_EVALUATOR_PROMPT);
    }, []);

    // Save prompt history to localStorage when changed
    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(promptHistory));
    }, [promptHistory]);

    // Load templates from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        if (stored) setTemplates(JSON.parse(stored));
    }, []);

    // Save templates to localStorage
    useEffect(() => {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    }, [templates]);

    // CSV Upload for Q&A data
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = evt.target?.result;
            if (!data) return;
            try {
                const workbook = XLSX.read(data, { type: "binary" });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData: QAData[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                setCsvPreview(jsonData);
            } catch (error) {
                alert("Failed to parse file. Please ensure it's a valid CSV or XLSX.");
            }
        };
        reader.readAsBinaryString(file);
    }, []);

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

    // Save or update template
    const handleSaveTemplate = () => {
        if (!templateName.trim() || !templateContent.trim()) return;
        // Prevent saving with "all" category, default to "evaluation" if so
        const saveCategory: Exclude<TemplateCategory, "all"> =
            templateCategory === "all" ? "evaluation" : templateCategory;
        if (editingTemplateId) {
            setTemplates(templates.map(t =>
                t.id === editingTemplateId
                    ? { ...t, name: templateName, category: saveCategory, content: templateContent }
                    : t
            ));
        } else {
            setTemplates([
                {
                    id: Date.now().toString(),
                    name: templateName,
                    category: saveCategory,
                    content: templateContent,
                    usage: 0,
                    lastUsed: 0
                },
                ...templates
            ]);
        }
        setTemplateName("");
        setTemplateContent("");
        setEditingTemplateId(null);
    };

    // Edit template
    const handleEditTemplate = (tpl: PromptTemplate) => {
        setEditingTemplateId(tpl.id);
        setTemplateName(tpl.name);
        setTemplateCategory(tpl.category);
        setTemplateContent(tpl.content);
    };

    // Delete template
    const handleDeleteTemplate = (id: string) => {
        setTemplates(templates.filter(t => t.id !== id));
        if (editingTemplateId === id) {
            setEditingTemplateId(null);
            setTemplateName("");
            setTemplateContent("");
        }
    };

    // Use template (replace variables and set as current prompt)
    const handleUseTemplate = (tpl: PromptTemplate) => {
        // Simple variable replacement UI
        const matches = tpl.content.match(/\{\{(.*?)\}\}/g);
        let filled = tpl.content;
        if (matches) {
            for (const m of matches) {
                const varName = m.replace(/[{}]/g, "");
                const value = prompt(`Enter value for ${varName}:`, "");
                filled = filled.replace(m, value ?? "");
            }
        }
        setCurrentPrompt(filled);
        // Track usage
        setTemplates(templates.map(t =>
            t.id === tpl.id
                ? { ...t, usage: (t.usage || 0) + 1, lastUsed: Date.now() }
                : t
        ));
    };

    // Prompt test with LLM and metrics
    const handleTestPrompt = async () => {
        if (!currentPrompt.trim() || !question.trim() || !answer.trim()) {
            alert("Please provide a prompt, question, and answer before evaluating.");
            return;
        }
        setIsTesting(true);
        setEvaluationResult("");
        const promptWithQA = `${currentPrompt}\n\nQuestion:\n${question}\n\nAnswer:\n${answer}`;
        const start = Date.now();
        let status: "success" | "error" = "success";
        let usage = { tokens: 0, cost: 0 };
        let provider = llmService.service?.provider || "unknown";
        let content = "";
        try {
            const response = await llmService.service.sendPrompt(promptWithQA);
            const responseTime = Date.now() - start;

            // Get usage statistics (tokens, cost, etc.)
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
                content = "No evaluation result returned.";
                status = "error";
            }
            setEvaluationResult(content);

            const item: PromptHistoryItem = {
                prompt: currentPrompt,
                tokens: usage.tokens ?? 0,
                cost: usage.cost ?? 0,
                responseTime,
                success: !!content && content !== "No evaluation result returned.",
                timestamp: Date.now(),
            };
            setPromptHistory([item, ...promptHistory]);

            // Log prompt usage
            PromptLogger.logPrompt({
                component: "ResponseEvaluator",
                promptSnippet: currentPrompt.slice(0, 80),
                provider,
                status,
                tokens: usage.tokens ?? 0,
                cost: usage.cost ?? 0,
                timestamp: Date.now(),
            });
        } catch (err) {
            setEvaluationResult("Error: Unable to get evaluation from LLM service.");
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
            status = "error";
            // Log prompt usage
            PromptLogger.logPrompt({
                component: "ResponseEvaluator",
                promptSnippet: currentPrompt.slice(0, 80),
                provider,
                status,
                tokens: 0,
                cost: 0,
                timestamp: Date.now(),
            });
        }
        setIsTesting(false);
    };

    const handleRemovePromptHistory = (idx: number) => {
        setPromptHistory(promptHistory.filter((_, i) => i !== idx));
    };

    // Provider switching
    const handleSwitchProvider = (providerKey: string) => {
        setCurrentProvider(providerKey);
        if (llmService.service?.setProvider) {
            llmService.service.setProvider(providerKey);
        }
    };

    // Aggregate provider stats from PromptLogger
    useEffect(() => {
        const history = PromptLogger.getHistory();
        const stats: any = {};
        for (const entry of history) {
            const { provider, tokens, cost, status } = entry;
            const responseTime = (entry as any).responseTime ?? 0;
            if (!stats[provider]) {
                stats[provider] = {
                    count: 0,
                    totalTokens: 0,
                    totalCost: 0,
                    totalTime: 0,
                    successCount: 0
                };
            }
            stats[provider].count += 1;
            stats[provider].totalTokens += tokens || 0;
            stats[provider].totalCost += cost || 0;
            stats[provider].totalTime += responseTime || 0;
            if (status === "success") stats[provider].successCount += 1;
        }
        setProviderStats(stats);
    }, [promptHistory, currentProvider]);

    // Success rate calculation
    const successRate = promptHistory.length
        ? ((promptHistory.filter(h => h.success).length / promptHistory.length) * 100).toFixed(1)
        : "0";

    // Filtered and sorted templates for display
    const filteredTemplates = templates
        .filter(t =>
            (!templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase())) &&
            (templateCategory === "all" || t.category === templateCategory)
        )
        .sort((a, b) => b.usage - a.usage || b.lastUsed - a.lastUsed);

    return (
        <div style={{ padding: 32, maxWidth: 900, margin: "0 auto", fontFamily: "Segoe UI, Arial, sans-serif" }}>
            {/* Prompt Template System */}
            <div style={{
                marginBottom: 32,
                background: "#f8fafc",
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 1px 4px #e0e7ef"
            }}>
                <h3 style={{ marginTop: 0, marginBottom: 12 }}>Prompt Templates</h3>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    <select
                        value={templateCategory}
                        onChange={e => setTemplateCategory(e.target.value as TemplateCategory)}
                        style={{ padding: 6, borderRadius: 4, border: "1px solid #cbd5e1" }}
                    >
                        {TEMPLATE_CATEGORIES.map(c => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Template name"
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        style={{ flex: 1, padding: 6, borderRadius: 4, border: "1px solid #cbd5e1" }}
                    />
                    <button
                        onClick={handleSaveTemplate}
                        style={{
                            background: "#22c55e",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            padding: "6px 16px",
                            fontWeight: 500,
                            cursor: "pointer"
                        }}
                    >
                        {editingTemplateId ? "Update" : "Save"}
                    </button>
                    {editingTemplateId && (
                        <button
                            onClick={() => {
                                setEditingTemplateId(null);
                                setTemplateName("");
                                setTemplateContent("");
                            }}
                            style={{
                                background: "#64748b",
                                color: "#fff",
                                border: "none",
                                borderRadius: 4,
                                padding: "6px 12px",
                                fontWeight: 500,
                                cursor: "pointer"
                            }}
                        >
                            Cancel
                        </button>
                    )}
                </div>
                <textarea
                    placeholder="Prompt template (use {{variable}} for placeholders)"
                    value={templateContent}
                    onChange={e => setTemplateContent(e.target.value)}
                    style={{
                        width: "100%",
                        minHeight: 60,
                        marginBottom: 10,
                        padding: 8,
                        borderRadius: 4,
                        border: "1px solid #cbd5e1",
                        fontSize: 15
                    }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                        type="text"
                        placeholder="Search templates"
                        value={templateSearch}
                        onChange={e => setTemplateSearch(e.target.value)}
                        style={{ flex: 1, padding: 6, borderRadius: 4, border: "1px solid #cbd5e1" }}
                    />
                </div>
                <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Name</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Category</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Usage</th>
                                <th style={{ background: "#f1f5f9", padding: 6, border: "1px solid #e2e8f0" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTemplates.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "center", color: "#64748b", padding: 10 }}>
                                        No templates found.
                                    </td>
                                </tr>
                            )}
                            {filteredTemplates.map(tpl => (
                                <tr key={tpl.id} style={{ background: "#fff" }}>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{tpl.name}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{tpl.category}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{tpl.usage}</td>
                                    <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                                        <button
                                            onClick={() => handleUseTemplate(tpl)}
                                            style={{
                                                background: "#2563eb",
                                                color: "#fff",
                                                border: "none",
                                                borderRadius: 4,
                                                padding: "4px 10px",
                                                fontWeight: 500,
                                                cursor: "pointer",
                                                marginRight: 4
                                            }}
                                        >
                                            Use
                                        </button>
                                        <button
                                            onClick={() => handleEditTemplate(tpl)}
                                            style={{
                                                background: "#f59e42",
                                                color: "#fff",
                                                border: "none",
                                                borderRadius: 4,
                                                padding: "4px 10px",
                                                fontWeight: 500,
                                                cursor: "pointer",
                                                marginRight: 4
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTemplate(tpl.id)}
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
                <div style={{ color: "#2563eb", fontWeight: 600, marginTop: 4 }}>
                    Top Template: {templates.length > 0 ? templates.slice().sort((a, b) => b.usage - a.usage)[0].name : "None"}
                </div>
            </div>

            {/* Provider Comparison Interface */}
            <div style={{
                marginBottom: 32,
                background: "#f8fafc",
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 1px 4px #e0e7ef"
            }}>
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Provider Comparison</h3>
                <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                    {PROVIDERS.map(p => {
                        const stats = providerStats[p.key] || {};
                        const count = stats.count || 0;
                        const avgTokens = count ? (stats.totalTokens / count).toFixed(1) : "0";
                        const avgCost = count ? (stats.totalCost / count).toFixed(5) : "0";
                        const avgTime = count ? (stats.totalTime / count).toFixed(0) : "0";
                        const successRate = count ? ((stats.successCount / count) * 100).toFixed(1) : "0";
                        return (
                            <div key={p.key} style={{
                                flex: 1,
                                background: currentProvider === p.key ? "#dbeafe" : "#fff",
                                border: "1px solid #cbd5e1",
                                borderRadius: 6,
                                padding: 16,
                                boxShadow: currentProvider === p.key ? "0 0 0 2px #2563eb" : undefined
                            }}>
                                <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 8 }}>{p.name}</div>
                                <div>Avg Cost: <strong>${avgCost}</strong></div>
                                <div>Avg Response Time: <strong>{avgTime} ms</strong></div>
                                <div>Avg Tokens: <strong>{avgTokens}</strong></div>
                                <div>Success Rate: <strong>{successRate}%</strong></div>
                                <button
                                    onClick={() => handleSwitchProvider(p.key)}
                                    disabled={currentProvider === p.key}
                                    style={{
                                        marginTop: 10,
                                        background: currentProvider === p.key ? "#94a3b8" : "#2563eb",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 4,
                                        padding: "6px 16px",
                                        fontWeight: 500,
                                        cursor: currentProvider === p.key ? "not-allowed" : "pointer"
                                    }}
                                >
                                    {currentProvider === p.key ? "Current" : "Switch"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* CSV Upload Section */}
            <div style={{
                marginBottom: 32,
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "#f8fafc",
                padding: 20,
                borderRadius: 8,
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
            }}>
                <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
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
                    Upload Q&A File
                </button>
                <span style={{ color: "#64748b" }}>
                    {csvPreview.length > 0
                        ? `Loaded ${csvPreview.length} Q&A pairs`
                        : "No file uploaded yet"}
                </span>
            </div>

            {/* CSV Preview Area */}
            {csvPreview.length > 0 && (
                <div style={{
                    overflowX: "auto",
                    marginBottom: 32,
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    padding: 16
                }}>
                    <h4 style={{ marginTop: 0, marginBottom: 12, color: "#334155" }}>Uploaded Q&A Data Preview</h4>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead>
                            <tr>
                                {Object.keys(csvPreview[0]).map((key) => (
                                    <th key={key} style={{
                                        background: "#f1f5f9",
                                        padding: "8px 12px",
                                        border: "1px solid #e2e8f0",
                                        fontWeight: 600,
                                        textAlign: "left"
                                    }}>{key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {csvPreview.map((row, idx) => (
                                <tr key={idx} style={{ background: idx % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                    {Object.keys(csvPreview[0]).map((key) => (
                                        <td key={key} style={{
                                            padding: "8px 12px",
                                            border: "1px solid #e2e8f0"
                                        }}>{row[key]}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Question and Answer Inputs */}
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                    <label htmlFor="question-input" style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>Question</label>
                    <textarea
                        id="question-input"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="Enter the question to be evaluated"
                        style={{
                            width: "100%",
                            minHeight: 80,
                            padding: 10,
                            borderRadius: 4,
                            border: "1px solid #cbd5e1",
                            fontSize: 15,
                            resize: "vertical"
                        }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label htmlFor="answer-input" style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>Answer to Evaluate</label>
                    <textarea
                        id="answer-input"
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        placeholder="Enter the answer to be evaluated"
                        style={{
                            width: "100%",
                            minHeight: 80,
                            padding: 10,
                            borderRadius: 4,
                            border: "1px solid #cbd5e1",
                            fontSize: 15,
                            resize: "vertical"
                        }}
                    />
                </div>
            </div>

            {/* Default Prompt and Custom Prompt Creation */}
            <div style={{
                marginBottom: 24,
                background: "#f8fafc",
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 1px 4px #e0e7ef"
            }}>
                <div style={{ marginBottom: 8 }}>
                    <strong>Default Rally AI Evaluator Prompt:</strong>
                    <pre style={{
                        background: "#f1f5f9",
                        padding: 10,
                        borderRadius: 4,
                        marginTop: 6,
                        fontSize: 14,
                        whiteSpace: "pre-wrap"
                    }}>{DEFAULT_EVALUATOR_PROMPT}</pre>
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
                        disabled={isTesting || !question.trim() || !answer.trim()}
                        style={{
                            background: isTesting ? "#94a3b8" : "#2563eb",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            padding: "10px 20px",
                            fontWeight: 500,
                            cursor: isTesting || !question.trim() || !answer.trim() ? "not-allowed" : "pointer"
                        }}
                        title={!question.trim() || !answer.trim() ? "Enter question and answer first" : ""}
                    >
                        {isTesting ? "Evaluating..." : "Evaluate"}
                    </button>
                </div>
                {/* Evaluation Result */}
                {evaluationResult && (
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
                        <strong>Evaluation Result:</strong>
                        <div style={{ marginTop: 8 }}>{evaluationResult}</div>
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

export default ResponseEvaluator;