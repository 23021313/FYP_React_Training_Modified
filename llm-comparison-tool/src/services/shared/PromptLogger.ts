const LOCAL_STORAGE_KEY = "llm_prompt_logs";

export interface PromptLogEntry {
    component: string;
    promptSnippet: string;
    provider: string;
    status: "success" | "error";
    tokens: number;
    cost: number;
    timestamp: number;
}

function getHistory(): PromptLogEntry[] {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function logPrompt(entry: PromptLogEntry) {
    const history = getHistory();
    history.unshift(entry);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
}

export default {
    logPrompt,
    getHistory,
};
