export interface ModelPickerRecommendation {
  type: "Cloud" | "Local";
  name: string;
  provider: string;
  id: string;
  cost_per_1M: string;
  vram_required?: string;
  why: string;
}

export interface ModelPickerEntry {
  intent: string;
  tags: { difficulty: string; latency_pref: string };
  recommendations: ModelPickerRecommendation[];
}

export const MODEL_PICKER_CONFIG: ModelPickerEntry[] = [
  {
    intent: "Professional Coding / Debugging",
    tags: {
      difficulty: "High (multi-file refactors)",
      latency_pref: "High Quality over Speed",
    },
    recommendations: [
      {
        type: "Cloud",
        name: "Claude 4.6 Sonnet",
        provider: "Anthropic (via OpenRouter)",
        id: "anthropic/claude-sonnet-4-5",
        cost_per_1M: "$3.00 / $15.00",
        why: "Current king of SWE-bench (80.8%). Best for autonomous coding agents.",
      },
      {
        type: "Local",
        name: "Qwen3-Coder 14B",
        provider: "Local (Ollama)",
        id: "qwen3-coder:14b",
        cost_per_1M: "$0.00",
        vram_required: "11.2 GB (Q5_K_M)",
        why: "Fits perfectly on a 16 GB card. 90% of Sonnet's performance for $0/mo.",
      },
    ],
  },
  {
    intent: "Fast Casual Chat",
    tags: {
      difficulty: "Low (Q&A, Summaries)",
      latency_pref: "Instant (Blink of an eye)",
    },
    recommendations: [
      {
        type: "Cloud",
        name: "Gemini 2.0 Flash-Lite",
        provider: "Google (via OpenRouter)",
        id: "google/gemini-2.0-flash-lite-001",
        cost_per_1M: "$0.08 / $0.30",
        why: "Fastest time-to-first-token in its class. Great for quick Q&A.",
      },
      {
        type: "Local",
        name: "Llama 3.2 (3B)",
        provider: "Local (Ollama)",
        id: "llama3.2:3b",
        cost_per_1M: "$0.00",
        vram_required: "2.0 GB (Q4_K_M)",
        why: "Runs at 200+ tokens/sec on modern GPUs. Truly instant responses.",
      },
    ],
  },
  {
    intent: "Deep Reasoning / Science",
    tags: {
      difficulty: "Brain-melting (Logic, Math)",
      latency_pref: "Wait for 'Thinking Mode'",
    },
    recommendations: [
      {
        type: "Cloud",
        name: "Claude 3.7 Sonnet (Thinking)",
        provider: "Anthropic (via OpenRouter)",
        id: "anthropic/claude-3.7-sonnet:thinking",
        cost_per_1M: "$3.00 / $15.00",
        why: "Highest scores on GPQA-Diamond and AIME. Best for PhD-level research.",
      },
      {
        type: "Local",
        name: "DeepSeek-R1 (14B)",
        provider: "Local (Ollama)",
        id: "deepseek-r1:14b",
        cost_per_1M: "$0.00",
        vram_required: "9.0 GB (Q4_K_M)",
        why: "Open-weight reasoning model with chain-of-thought. Fits in 16 GB VRAM.",
      },
    ],
  },
];
