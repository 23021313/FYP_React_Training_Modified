// llmService.js
import axios from 'axios';

// Example cost per 1K tokens (USD) - adjust as needed
const PROVIDER_COSTS = {
    openai: 0.03,      // GPT-4
    gemini: 0.01,      // Google Gemini
    llama: 0.002,      // Llama
    deepseek: 0.005    // DeepSeek
};

class LLMService {
    constructor() {
        this.provider = 'openai';
        this.tokenUsage = 0;
        this.totalCost = 0;
        this.apiKeys = {
            openai: import.meta.env.VITE_OPENAI_API_KEY || '',
            gemini: import.meta.env.VITE_GEMINI_API_KEY || '',
            llama: import.meta.env.VITE_LLAMA_API_KEY || '',
            deepseek: import.meta.env.VITE_DEEPSEEK_API_KEY || ''
        };

        console.log('LLM Service initialized. Available providers:',
            Object.keys(this.apiKeys).filter(key => this.apiKeys[key])
        );
    }

    setProvider(provider) {
        if (!PROVIDER_COSTS[provider]) {
            throw new Error(`Unsupported provider: ${provider}. Available: ${Object.keys(PROVIDER_COSTS).join(', ')}`);
        }
        
        if (!this.apiKeys[provider]) {
            throw new Error(
                `Missing API key for provider "${provider}". Please set the environment variable VITE_${provider.toUpperCase()}_API_KEY in your .env file.`
            );
        }
        
        this.provider = provider;
        console.log(`Switched to provider: ${provider}`);
    }

    setApiKey(provider, apiKey) {
        if (!PROVIDER_COSTS[provider]) {
            throw new Error(`Unsupported provider: ${provider}`);
        }
        this.apiKeys[provider] = apiKey;
    }

    // Get context limits for different providers and models
    _getContextLimits(provider, model) {
        const limits = {
            openai: {
                'gpt-4': 8192,
                'gpt-4-turbo': 128000,
                'gpt-4-1106-preview': 128000,
                'gpt-3.5-turbo': 16384,
                'gpt-3.5-turbo-16k': 16384,
                'default': 4096
            },
            gemini: {
                'gemini-pro': 32768,
                'default': 32768
            },
            llama: {
                'llama-2-70b-chat': 4096,
                'default': 4096
            },
            deepseek: {
                'deepseek-chat': 32768,
                'default': 32768
            }
        };

        const providerLimits = limits[provider] || limits.openai;
        return providerLimits[model] || providerLimits.default;
    }

    // Smart text truncation that preserves document structure
    _truncateText(text, maxTokens) {
        const estimatedTokens = this._estimateTokens(text);
        
        if (estimatedTokens <= maxTokens) {
            return { text, wasTruncated: false };
        }
        
        // Calculate target character count (with some buffer)
        const maxChars = Math.floor(maxTokens * 3.5); // More conservative estimate
        
        if (text.length <= maxChars) {
            return { text, wasTruncated: false };
        }
        
        // Try to truncate at natural boundaries (in order of preference)
        const truncated = text.substring(0, maxChars);
        const boundaries = [
            { char: '\n\n', weight: 1.0 }, // Paragraph breaks
            { char: '. ', weight: 0.9 },   // Sentence endings
            { char: '\n', weight: 0.8 },   // Line breaks
            { char: ', ', weight: 0.6 },   // Clause breaks
            { char: ' ', weight: 0.5 }     // Word breaks
        ];
        
        let bestCutPoint = maxChars;
        let bestScore = 0;
        
        for (const boundary of boundaries) {
            const lastIndex = truncated.lastIndexOf(boundary.char);
            if (lastIndex > maxChars * 0.7) { // Don't cut too early
                const score = boundary.weight * (lastIndex / maxChars);
                if (score > bestScore) {
                    bestScore = score;
                    bestCutPoint = lastIndex + boundary.char.length;
                }
            }
        }
        
        const finalText = text.substring(0, bestCutPoint).trim() + 
                         '\n\n[Note: Document was truncated due to length constraints]';
        
        return { text: finalText, wasTruncated: true };
    }

    async sendPrompt(prompt, options = {}) {
        if (!this.apiKeys[this.provider]) {
            throw new Error(
                `No API key set for provider "${this.provider}". Please set VITE_${this.provider.toUpperCase()}_API_KEY or use setApiKey() method.`
            );
        }

        // Get model and context limits
        const model = options.model || this._getDefaultModel();
        const contextLimit = this._getContextLimits(this.provider, model);
        const responseTokens = options.max_tokens || 1000;
        const systemTokens = 100; // Buffer for system overhead
        
        // Calculate available tokens for the prompt
        const maxPromptTokens = contextLimit - responseTokens - systemTokens;
        
        // Truncate prompt if necessary
        const { text: processedPrompt, wasTruncated } = this._truncateText(prompt, maxPromptTokens);
        
        if (wasTruncated) {
            console.warn(`Prompt was truncated from ${this._estimateTokens(prompt)} to ~${this._estimateTokens(processedPrompt)} tokens to fit ${this.provider} context limit`);
        }

        let response, tokensUsed = 0;
        
        try {
            switch (this.provider) {
                case 'openai':
                    response = await this._callOpenAI(processedPrompt, { ...options, model });
                    tokensUsed = response.usage?.total_tokens || 0;
                    break;
                case 'gemini':
                    response = await this._callGemini(processedPrompt, { ...options, model });
                    tokensUsed = response.tokensUsed || 0;
                    break;
                case 'llama':
                    response = await this._callLlama(processedPrompt, { ...options, model });
                    tokensUsed = response.tokensUsed || 0;
                    break;
                case 'deepseek':
                    response = await this._callDeepSeek(processedPrompt, { ...options, model });
                    tokensUsed = response.tokensUsed || 0;
                    break;
                default:
                    throw new Error(`Unsupported provider: ${this.provider}`);
            }
            
            this._trackUsage(tokensUsed);
            
            // Add metadata about truncation
            if (wasTruncated && response) {
                response._metadata = {
                    wasTruncated,
                    originalTokens: this._estimateTokens(prompt),
                    processedTokens: this._estimateTokens(processedPrompt)
                };
            }
            
            return response;
            
        } catch (error) {
            console.error(`Error calling ${this.provider}:`, error);
            throw new Error(`Failed to get response from ${this.provider}: ${error.message}`);
        }
    }

    _getDefaultModel() {
        const defaults = {
            openai: 'gpt-3.5-turbo',
            gemini: 'gemini-pro', 
            llama: 'llama-2-70b-chat',
            deepseek: 'deepseek-chat'
        };
        return defaults[this.provider] || 'gpt-3.5-turbo';
    }

    _trackUsage(tokens) {
        this.tokenUsage += tokens;
        this.totalCost += (tokens / 1000) * PROVIDER_COSTS[this.provider];
    }

    getUsage() {
        return {
            provider: this.provider,
            tokens: this.tokenUsage,
            cost: this.totalCost.toFixed(4)
        };
    }

    // --- Provider-specific API calls ---

    async _callOpenAI(prompt, options) {
        const apiKey = this.apiKeys.openai;
        const url = 'https://api.openai.com/v1/chat/completions';
        
        const data = {
            model: options.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7,
            ...options
        };
        
        try {
            const res = await axios.post(url, data, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return res.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('OpenAI API Error Response Data:', error.response.data);
                throw new Error(
                    `OpenAI API request failed: ${error.response.status} ${error.response.statusText}. ` +
                    `Details: ${JSON.stringify(error.response.data)}`
                );
            }
            throw error;
        }
    }

    async _callGemini(prompt, options) {
        const apiKey = this.apiKeys.gemini;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        const data = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: options.max_tokens || 1000,
                temperature: options.temperature || 0.7,
            },
            ...options
        };
        
        const res = await axios.post(url, data, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        return {
            ...res.data,
            tokensUsed: this._estimateTokens(prompt + (res.data.candidates?.[0]?.content?.parts?.[0]?.text || ''))
        };
    }

    async _callLlama(prompt, options) {
        const apiKey = this.apiKeys.llama;
        const url = 'https://api.llama.ai/v1/chat/completions';
        const data = {
            model: options.model || 'llama-2-70b-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7,
            ...options
        };
        
        const res = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        return {
            ...res.data,
            tokensUsed: res.data.usage?.total_tokens || this._estimateTokens(prompt)
        };
    }

    async _callDeepSeek(prompt, options) {
        const apiKey = this.apiKeys.deepseek;
        const url = 'https://api.deepseek.com/v1/chat/completions';
        const data = {
            model: options.model || 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7,
            ...options
        };
        
        const res = await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        return {
            ...res.data,
            tokensUsed: res.data.usage?.total_tokens || this._estimateTokens(prompt)
        };
    }

    _estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    resetUsage() {
        this.tokenUsage = 0;
        this.totalCost = 0;
    }

    getAvailableProviders() {
        return Object.keys(this.apiKeys).filter(key => this.apiKeys[key]);
    }
}

// Create a singleton instance
const llmServiceInstance = new LLMService();

// Helper function to truncate text to fit within token limits
const truncateText = (text, maxTokens = 6000) => {
    // This function is now moved into LLMService._truncateText()
    // Keeping this for backward compatibility if needed
    console.warn('Using deprecated truncateText function. Use LLMService._truncateText() instead.');
    return text.substring(0, maxTokens * 4);
};

// Export both the service class and the analyze function
export default {
    LLMService,
    service: llmServiceInstance
};