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
  ModelsResponse,
} from "@shared/types/inference";
import type {
  RenderJobCreateRequest,
  RenderJobResponse,
} from "@shared/types/render";
import type {
  AdminUserResponse,
  UserUpdateRequest,
  AdjustBalanceRequest,
  SystemStatsResponse,
  InviteCreateRequest,
  InviteCreateResponse,
  InviteListResponse,
} from "@shared/types/admin";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      message = JSON.parse(text).detail || text;
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

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      message = JSON.parse(text).detail || text;
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
  signup: (data: SignupRequest) => post<TokenResponse>("/v1/auth/signup", data),
  getMe: () => get<UserResponse>("/v1/auth/me"),
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

// Inference
export const inference = {
  listModels: () => get<ModelsResponse>("/v1/inference/models"),
  chatCompletion: (data: ChatCompletionRequest) =>
    post<ChatCompletionResponse>("/v1/inference/chat/completions", data),
  chatCompletionStream: async function* (
    data: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionChunk> {
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
          yield JSON.parse(payload) as ChatCompletionChunk;
        } catch {
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
};

export { ApiError };
