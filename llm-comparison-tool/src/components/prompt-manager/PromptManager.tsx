import React, { useEffect, useState } from "react";

interface PromptHistoryItem {
    prompt: string;
    tokens: number;
    cost: number;
    responseTime: number;
    success: boolean;
    timestamp: number;
}
//dfdfdffd

const promptKeys = [
    { key: "business_prompts_history", label: "Business Prompts" },
    { key: "consumer_prompts_history", label: "Consumer Prompts" },
    { key: "response_prompts_history", label: "Response Evaluation Prompts" },
];

function exportToCSV(history: PromptHistoryItem[], filename: string) {
    if (!history.length) return;
    const headers = Object.keys(history[0]);
    const rows = history.map(item =>
        headers.map(h => `"${(item as any)[h] ?? ""}"`).join(",")
    );
    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

const PromptManager: React.FC = () => {
    const [histories, setHistories] = useState<Record<string, PromptHistoryItem[]>>({});
    const [search, setSearch] = useState<string>("");

    useEffect(() => {
        const loaded: Record<string, PromptHistoryItem[]> = {};
        promptKeys.forEach(({ key }) => {
            const raw = localStorage.getItem(key);
            loaded[key] = raw ? JSON.parse(raw) : [];
        });
        setHistories(loaded);
    }, []);

    const getStats = (history: PromptHistoryItem[]) => {
        if (!history.length) return null;
        const total = history.length;
        const avgTokens = Math.round(history.reduce((a, b) => a + (b.tokens || 0), 0) / total);
        const avgCost = history.reduce((a, b) => a + (b.cost || 0), 0) / total;
        const avgResponseTime = Math.round(history.reduce((a, b) => a + (b.responseTime || 0), 0) / total);
        const successRate = Math.round((history.filter(h => h.success).length / total) * 100);
        return { total, avgTokens, avgCost, avgResponseTime, successRate };
    };

    // Top prompts summary (by usage)
    const getTopPrompts = () => {
        const all = Object.values(histories).flat();
        const map: Record<string, { prompt: string; count: number }> = {};
        all.forEach(item => {
            if (!item.prompt) return;
            map[item.prompt] = map[item.prompt]
                ? { prompt: item.prompt, count: map[item.prompt].count + 1 }
                : { prompt: item.prompt, count: 1 };
        });
        return Object.values(map)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    };

    return (
        <div
            style={{
                padding: 32,
                maxWidth: 1200,
                margin: "0 auto",
                fontFamily: "Segoe UI, Arial, sans-serif",
                background: "linear-gradient(120deg, #f8fafc 60%, #e0e7ef 100%)",
                minHeight: "100vh"
            }}
        >
            <h2
                style={{
                    textAlign: "center",
                    marginBottom: 32,
                    color: "#2563eb",
                    letterSpacing: 1.5,
                    fontWeight: 700,
                    fontSize: 32
                }}
            >
                Prompt Manager
            </h2>
            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
                <input
                    type="text"
                    placeholder="🔍 Search prompts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 6,
                        border: "1.5px solid #cbd5e1",
                        fontSize: 16,
                        background: "#fff"
                    }}
                />
            </div>
            <div style={{ marginBottom: 32 }}>
                <h3 style={{ marginTop: 0, marginBottom: 8, color: "#334155" }}>Top Used Prompts</h3>
                <table style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 4px #e0e7ef",
                    overflow: "hidden"
                }}>
                    <thead>
                        <tr>
                            <th style={{
                                background: "#f1f5f9",
                                padding: 10,
                                border: "1px solid #e2e8f0",
                                fontWeight: 600,
                                fontSize: 15
                            }}>Prompt</th>
                            <th style={{
                                background: "#f1f5f9",
                                padding: 10,
                                border: "1px solid #e2e8f0",
                                fontWeight: 600,
                                fontSize: 15
                            }}>Usage Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {getTopPrompts().length === 0 ? (
                            <tr>
                                <td colSpan={2} style={{ textAlign: "center", color: "#64748b", padding: 14 }}>
                                    No prompt usage data.
                                </td>
                            </tr>
                        ) : (
                            getTopPrompts().map((p, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                    <td style={{
                                        maxWidth: 400,
                                        wordBreak: "break-word",
                                        padding: 10,
                                        border: "1px solid #e2e8f0",
                                        fontSize: 15
                                    }}>{p.prompt}</td>
                                    <td style={{
                                        padding: 10,
                                        border: "1px solid #e2e8f0",
                                        fontSize: 15,
                                        textAlign: "center"
                                    }}>{p.count}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
                {promptKeys.map(({ key, label }) => {
                    const history = histories[key] || [];
                    const filtered = search
                        ? history.filter(h => h.prompt.toLowerCase().includes(search.toLowerCase()))
                        : history;
                    const stats = getStats(filtered);
                    return (
                        <div key={key} style={{
                            background: "#fff",
                            borderRadius: 12,
                            boxShadow: "0 2px 8px #e0e7ef",
                            padding: 28,
                            minWidth: 320,
                            flex: 1,
                            marginBottom: 8,
                            border: "1.5px solid #e2e8f0"
                        }}>
                            <h3 style={{
                                marginTop: 0,
                                color: "#2563eb",
                                fontWeight: 600,
                                fontSize: 20,
                                marginBottom: 12
                            }}>{label}</h3>
                            {stats ? (
                                <>
                                    <div style={{ marginBottom: 4 }}>Total Prompts: <b>{stats.total}</b></div>
                                    <div style={{ marginBottom: 4 }}>Avg. Tokens: <b>{stats.avgTokens}</b></div>
                                    <div style={{ marginBottom: 4 }}>Avg. Cost: <b>${stats.avgCost.toFixed(4)}</b></div>
                                    <div style={{ marginBottom: 4 }}>Avg. Response Time: <b>{stats.avgResponseTime} ms</b></div>
                                    <div style={{ marginBottom: 12 }}>Success Rate: <b>{stats.successRate}%</b></div>
                                    <button
                                        onClick={() => exportToCSV(filtered, `${label.replace(/\s+/g, "_")}_history.csv`)}
                                        style={{
                                            marginTop: 4,
                                            background: "#2563eb",
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: 6,
                                            padding: "8px 20px",
                                            fontWeight: 600,
                                            fontSize: 15,
                                            cursor: "pointer",
                                            boxShadow: "0 1px 2px #cbd5e1"
                                        }}
                                    >
                                        ⬇ Export CSV
                                    </button>
                                </>
                            ) : (
                                <div style={{ color: "#64748b" }}>No prompt history found.</div>
                            )}
                        </div>
                    );
                })}
            </div>
            <h3 style={{
                marginTop: 0,
                marginBottom: 16,
                color: "#334155",
                fontWeight: 600,
                fontSize: 22
            }}>Prompt Usage Details</h3>
            {promptKeys.map(({ key, label }) => {
                const history = histories[key] || [];
                const filtered = search
                    ? history.filter(h => h.prompt.toLowerCase().includes(search.toLowerCase()))
                    : history;
                return (
                    <div key={key} style={{ marginBottom: 32 }}>
                        <h4 style={{
                            marginBottom: 8,
                            color: "#2563eb",
                            fontWeight: 500,
                            fontSize: 18
                        }}>{label}</h4>
                        {filtered.length === 0 ? (
                            <div style={{ color: "#64748b", marginBottom: 16 }}>No prompt usage data.</div>
                        ) : (
                            <div style={{
                                overflowX: "auto",
                                background: "#fff",
                                borderRadius: 8,
                                boxShadow: "0 1px 4px #e0e7ef",
                                border: "1px solid #e2e8f0"
                            }}>
                                <table style={{
                                    borderCollapse: "collapse",
                                    width: "100%",
                                    marginBottom: 12,
                                    fontSize: 15
                                }}>
                                    <thead style={{
                                        position: "sticky",
                                        top: 0,
                                        background: "#f1f5f9",
                                        zIndex: 1
                                    }}>
                                        <tr>
                                            <th style={{ background: "#f1f5f9", padding: 8, border: "1px solid #e2e8f0" }}>Prompt</th>
                                            <th style={{ background: "#f1f5f9", padding: 8, border: "1px solid #e2e8f0" }}>Tokens</th>
                                            <th style={{ background: "#f1f5f9", padding: 8, border: "1px solid #e2e8f0" }}>Cost ($)</th>
                                            <th style={{ background: "#f1f5f9", padding: 8, border: "1px solid #e2e8f0" }}>Response Time (ms)</th>
                                            <th style={{ background: "#f1f5f9", padding: 8, border: "1px solid #e2e8f0" }}>Success</th>
                                            <th style={{ background: "#f1f5f9", padding: 8, border: "1px solid #e2e8f0" }}>Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((item, idx) => (
                                            <tr key={idx} style={{ background: idx % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                                <td style={{ maxWidth: 250, wordBreak: "break-word", padding: 8, border: "1px solid #e2e8f0" }}>{item.prompt}</td>
                                                <td style={{ padding: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>{item.tokens}</td>
                                                <td style={{ padding: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>{item.cost}</td>
                                                <td style={{ padding: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>{item.responseTime}</td>
                                                <td style={{ padding: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>{item.success ? "✅" : "❌"}</td>
                                                <td style={{ padding: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>{new Date(item.timestamp).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default PromptManager;