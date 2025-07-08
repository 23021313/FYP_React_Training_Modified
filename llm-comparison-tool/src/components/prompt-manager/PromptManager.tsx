import React, { useEffect, useState } from "react";

interface PromptHistoryItem {
    prompt: string;
    tokens: number;
    cost: number;
    responseTime: number;
    success: boolean;
    timestamp: number;
}

const promptKeys = [
    { key: "business_prompts_history", label: "Business Prompts" },
    { key: "consumer_prompts_history", label: "Consumer Prompts" },
    { key: "response_prompts_history", label: "Response Evaluation Prompts" },
];

const PromptManager: React.FC = () => {
    const [histories, setHistories] = useState<Record<string, PromptHistoryItem[]>>({});

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

    return (
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto", fontFamily: "Segoe UI, Arial, sans-serif" }}>
            <h2 style={{ textAlign: "center", marginBottom: 32 }}>Prompt Manager</h2>
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
                {promptKeys.map(({ key, label }) => {
                    const history = histories[key] || [];
                    const stats = getStats(history);
                    return (
                        <div key={key} style={{
                            background: "#f8fafc",
                            borderRadius: 8,
                            boxShadow: "0 1px 4px #e0e7ef",
                            padding: 20,
                            minWidth: 300,
                            flex: 1
                        }}>
                            <h3 style={{ marginTop: 0 }}>{label}</h3>
                            {stats ? (
                                <>
                                    <div>Total Prompts: <b>{stats.total}</b></div>
                                    <div>Avg. Tokens: <b>{stats.avgTokens}</b></div>
                                    <div>Avg. Cost: <b>${stats.avgCost.toFixed(4)}</b></div>
                                    <div>Avg. Response Time: <b>{stats.avgResponseTime} ms</b></div>
                                    <div>Success Rate: <b>{stats.successRate}%</b></div>
                                </>
                            ) : (
                                <div style={{ color: "#64748b" }}>No prompt history found.</div>
                            )}
                        </div>
                    );
                })}
            </div>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Prompt Usage Details</h3>
            {promptKeys.map(({ key, label }) => {
                const history = histories[key] || [];
                return (
                    <div key={key} style={{ marginBottom: 32 }}>
                        <h4 style={{ marginBottom: 8 }}>{label}</h4>
                        {history.length === 0 ? (
                            <div style={{ color: "#64748b", marginBottom: 16 }}>No prompt usage data.</div>
                        ) : (
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
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((item, idx) => (
                                            <tr key={idx} style={{ background: idx % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                                <td style={{ maxWidth: 250, wordBreak: "break-word", padding: 6, border: "1px solid #e2e8f0" }}>{item.prompt}</td>
                                                <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.tokens}</td>
                                                <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.cost}</td>
                                                <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.responseTime}</td>
                                                <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{item.success ? "✅" : "❌"}</td>
                                                <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{new Date(item.timestamp).toLocaleString()}</td>
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
