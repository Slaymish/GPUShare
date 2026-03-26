import { getToken } from "./auth";
import type {
  SignupRequest,
  LoginRequest,
  TokenResponse,
  UserResponse,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  ApiKeyResponse,
} from "@shared/types/auth";
import type {
  BalanceResponse,
  UsageLogResponse,
  InvoiceResponse,
  TopUpRequest,
  TopUpResponse,
} from "@shared/types/billing";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  QueuePositionEvent,
  ModelsResponse,
} from "@shared/types/inference";
import type {
  RenderJobCreateRequest,
  RenderJobResponse,
} from "@shared/types/render";
import type { SkillSummary, SkillDetail } from "@shared/types/skills";
import type {
  McpServerCreate,
  McpServerUpdate,
  McpServerResponse,
  McpToolsResponse,
  McpToolCallRequest,
  McpToolCallResponse,
} from "@shared/types/mcp";
import type {
  AdminUserResponse,
  UserUpdateRequest,
  AdjustBalanceRequest,
  SystemStatsResponse,
  InviteCreateRequest,
  InviteCreateResponse,
  InviteListResponse,
} from "@shared/types/admin";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://localhost:8000");

export interface PowerData {
  current_watts: number;
  today_kwh: number;
  month_kwh: number;
  today_cost: number;
  month_cost: number;
  currency: string;
  rate_per_kwh: number;
}

export interface HealthResponse {
  status: string;
  node: string;
  services: string[];
  ollama: "ready" | "warming_up" | "offline";
  ollama_models: string[];
  integrations: {
    stripe: boolean;
    r2: boolean;
    resend: boolean;
    billing: boolean;
    openrouter: boolean;
    tapo: boolean;
  };
  power: PowerData | null;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error("Server unreachable");
  return res.json();
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Cannot connect to server. The server may be offline — please try again later.",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      // Handle FastAPI validation errors (422)
      if (Array.isArray(json.detail)) {
        message = json.detail
          .map((err: any) => `${err.loc.join(".")}: ${err.msg}`)
          .join(", ");
      } else if (typeof json.detail === "string") {
        message = json.detail;
      } else if (typeof json.detail === "object") {
        message = JSON.stringify(json.detail);
      } else {
        message = text;
      }
    } catch {
      message = text;
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestFormData<T>(
  method: string,
  path: string,
  formData: FormData,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData,
    });
  } catch {
    throw new Error(
      "Cannot connect to server. The server may be offline — please try again later.",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      // Handle FastAPI validation errors (422)
      if (Array.isArray(json.detail)) {
        message = json.detail
          .map((err: any) => `${err.loc.join(".")}: ${err.msg}`)
          .join(", ");
      } else if (typeof json.detail === "string") {
        message = json.detail;
      } else if (typeof json.detail === "object") {
        message = JSON.stringify(json.detail);
      } else {
        message = text;
      }
    } catch {
      message = text;
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

function get<T>(path: string) {
  return request<T>("GET", path);
}
function post<T>(path: string, body?: unknown) {
  return request<T>("POST", path, body);
}
function patch<T>(path: string, body?: unknown) {
  return request<T>("PATCH", path, body);
}
function del<T>(path: string) {
  return request<T>("DELETE", path);
}

// Auth
export const auth = {
  login: (data: LoginRequest) => post<TokenResponse>("/v1/auth/login", data),
  signup: (data: SignupRequest) => post<UserResponse>("/v1/auth/signup", data),
  guestLogin: () => post<TokenResponse>("/v1/auth/guest", {}),
  getMe: () => get<UserResponse>("/v1/auth/me"),
  updateMe: (data: {
    name?: string;
    email?: string;
    theme?: string;
    auto_light_model?: string;
    auto_heavy_model?: string;
    auto_token_threshold?: number;
    onboarding_completed?: boolean;
  }) => patch<UserResponse>("/v1/auth/me", data),
  requestPasswordReset: (email: string) =>
    post<{ message: string }>("/v1/auth/password-reset/request", { email }),
  confirmPasswordReset: (token: string, password: string) =>
    post<{ message: string }>("/v1/auth/password-reset/confirm", {
      token,
      password,
    }),
  listApiKeys: () => get<ApiKeyResponse[]>("/v1/auth/api-keys"),
  createApiKey: (data: ApiKeyCreateRequest) =>
    post<ApiKeyCreateResponse>("/v1/auth/api-keys", data),
  revokeApiKey: (id: string) => del<void>(`/v1/auth/api-keys/${id}`),
  updateMyLimit: (hard_limit_nzd: number) =>
    patch<{ hard_limit_nzd: number }>("/v1/auth/me/limit", { hard_limit_nzd }),
};

// Billing
export const billing = {
  getBalance: () => get<BalanceResponse>("/v1/account/balance"),
  getUsage: (limit = 50, offset = 0) =>
    get<UsageLogResponse[]>(
      `/v1/account/usage?limit=${limit}&offset=${offset}`,
    ),
  getInvoices: () => get<InvoiceResponse[]>("/v1/account/invoices"),
  createTopUp: (data: TopUpRequest) =>
    post<TopUpResponse>("/v1/account/topup", data),
  setupPaymentMethod: () =>
    post<{ client_secret: string }>("/v1/account/payment-method/setup", {}),
  listPaymentMethods: () =>
    get<
      Array<{
        id: string;
        card_brand: string;
        card_last4: string;
        card_exp_month: number;
        card_exp_year: number;
      }>
    >("/v1/account/payment-methods"),
  deletePaymentMethod: (id: string) =>
    del<void>(`/v1/account/payment-methods/${id}`),
};

// Aggregated account page data
export interface AccountPageResponse {
  user: UserResponse & {
    auto_light_model: string | null;
    auto_heavy_model: string | null;
    auto_token_threshold: number | null;
  };
  balance: BalanceResponse;
  usage_recent: UsageLogResponse[];
  usage_all: UsageLogResponse[];
  invoices: InvoiceResponse[];
  api_keys: ApiKeyResponse[];
  payment_methods: Array<{
    id: string;
    card_brand: string;
    card_last4: string;
    card_exp_month: number;
    card_exp_year: number;
  }>;
  models: ModelsResponse;
  health: HealthResponse;
}

export const account = {
  getPage: () => get<AccountPageResponse>("/v1/account"),
};

// Inference
export const inference = {
  listModels: () => get<ModelsResponse>("/v1/inference/models"),
  chatCompletion: (data: ChatCompletionRequest) =>
    post<ChatCompletionResponse>("/v1/inference/chat/completions", data),
  chatCompletionStream: async function* (
    data: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionChunk | QueuePositionEvent> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/v1/inference/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...data, stream: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload);
          if ("error" in parsed) {
            throw new Error(parsed.error);
          }
          if ("queue_position" in parsed) {
            yield parsed as QueuePositionEvent;
          } else {
            yield parsed as ChatCompletionChunk;
          }
        } catch (e) {
          if (e instanceof Error && e.message) throw e;
          // skip malformed chunks
        }
      }
    }
  },
};

// Render
export const render = {
  createJob: (file: File, params: RenderJobCreateRequest) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("engine", params.engine);
    if (params.frame_start !== undefined)
      formData.append("frame_start", String(params.frame_start));
    if (params.frame_end !== undefined)
      formData.append("frame_end", String(params.frame_end));
    if (params.samples !== undefined)
      formData.append("samples", String(params.samples));
    if (params.resolution_x !== undefined)
      formData.append("resolution_x", String(params.resolution_x));
    if (params.resolution_y !== undefined)
      formData.append("resolution_y", String(params.resolution_y));
    if (params.output_format)
      formData.append("output_format", params.output_format);
    return requestFormData<RenderJobResponse>(
      "POST",
      "/v1/render/jobs",
      formData,
    );
  },
  listJobs: () => get<RenderJobResponse[]>("/v1/render/jobs"),
  getJob: (id: string) => get<RenderJobResponse>(`/v1/render/jobs/${id}`),
  cancelJob: (id: string) => del<void>(`/v1/render/jobs/${id}`),
};

// Skills
export const skills = {
  list: () => get<SkillSummary[]>("/v1/skills"),
  get: (name: string) =>
    get<SkillDetail>(`/v1/skills/${encodeURIComponent(name)}`),
};

// Admin
export const admin = {
  getStats: () => get<SystemStatsResponse>("/v1/admin/stats"),
  listUsers: () => get<AdminUserResponse[]>("/v1/admin/users"),
  getUser: (id: string) => get<AdminUserResponse>(`/v1/admin/users/${id}`),
  updateUser: (id: string, data: UserUpdateRequest) =>
    patch<AdminUserResponse>(`/v1/admin/users/${id}`, data),
  adjustBalance: (id: string, data: AdjustBalanceRequest) =>
    post<{ balance_nzd: number }>(`/v1/admin/users/${id}/adjust-balance`, data),
  // Invites
  listInvites: () => get<InviteListResponse[]>("/v1/admin/invites"),
  createInvite: (data: InviteCreateRequest) =>
    post<InviteCreateResponse>("/v1/admin/invites", data),
  deleteInvite: (id: string) => del<void>(`/v1/admin/invites/${id}`),
  checkIntegrationHealth: (key: string) =>
    get<{ status: string; integration: string; detail?: string }>(
      `/v1/admin/health/${key}`,
    ),
};

// MCP Servers
export const mcpServers = {
  list: () => get<McpServerResponse[]>("/v1/mcp/servers"),
  create: (data: McpServerCreate) =>
    post<McpServerResponse>("/v1/mcp/servers", data),
  update: (id: string, data: McpServerUpdate) =>
    patch<McpServerResponse>(`/v1/mcp/servers/${id}`, data),
  delete: (id: string) => del<void>(`/v1/mcp/servers/${id}`),
  connect: (id: string) =>
    post<McpServerResponse>(`/v1/mcp/servers/${id}/connect`),
  disconnect: (id: string) =>
    post<McpServerResponse>(`/v1/mcp/servers/${id}/disconnect`),
  listTools: () => get<McpToolsResponse>("/v1/mcp/tools"),
  callTool: (data: McpToolCallRequest) =>
    post<McpToolCallResponse>("/v1/mcp/tools/call", data),
};

// Model picker
export interface ModelPickerCloudRec {
  type: "cloud";
  id: string;
  name: string;
  provider: string;
  cost_per_1m: string;
  cost_per_1m_input_usd: number;
  cost_per_1m_output_usd: number;
  context_length: number | null;
  benchmark_score: number | null;
  benchmark_label: string;
  in_catalog: boolean;
  why: string;
}

export interface ModelPickerLocalRec {
  type: "local";
  id: string;
  name: string;
  provider: string;
  cost_per_1m: string;
  vram_required_gb: number;
  vram_spare_gb: number;
  params_b: number;
  tokens_per_sec: number;
  daily_electricity_cost: number;
  available: boolean;
  why: string;
}

export interface ModelPickerIntent {
  id: string;
  label: string;
  tags: { difficulty: string; latency_pref: string };
  cloud: ModelPickerCloudRec;
  local: ModelPickerLocalRec | null;
}

export interface ModelPickerResponse {
  intents: ModelPickerIntent[];
  gpu_vram_gb: number;
  data_source: "live" | "static";
  cache_age_seconds: number | null;
  benchmarks_enabled: boolean;
}

export const modelPicker = {
  getRecommendations: () => get<ModelPickerResponse>("/v1/model-picker/recommendations"),
};

export { ApiError };
