import { getToken } from './auth';
import type { SignupRequest, LoginRequest, TokenResponse, UserResponse, ApiKeyCreateRequest, ApiKeyCreateResponse, ApiKeyResponse } from '@shared/types/auth';
import type { BalanceResponse, UsageLogResponse, InvoiceResponse, TopUpRequest, TopUpResponse } from '@shared/types/billing';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ModelsResponse } from '@shared/types/inference';
import type { RenderJobCreateRequest, RenderJobResponse } from '@shared/types/render';
import type { AdminUserResponse, UserUpdateRequest, AdjustBalanceRequest, SystemStatsResponse } from '@shared/types/admin';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

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

async function requestFormData<T>(method: string, path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { method, headers, body: formData });

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

function get<T>(path: string) { return request<T>('GET', path); }
function post<T>(path: string, body?: unknown) { return request<T>('POST', path, body); }
function put<T>(path: string, body?: unknown) { return request<T>('PUT', path, body); }
function del<T>(path: string) { return request<T>('DELETE', path); }

// Auth
export const auth = {
  login: (data: LoginRequest) => post<TokenResponse>('/v1/auth/login', data),
  signup: (data: SignupRequest) => post<TokenResponse>('/v1/auth/signup', data),
  getMe: () => get<UserResponse>('/v1/auth/me'),
  listApiKeys: () => get<ApiKeyResponse[]>('/v1/auth/api-keys'),
  createApiKey: (data: ApiKeyCreateRequest) => post<ApiKeyCreateResponse>('/v1/auth/api-keys', data),
  revokeApiKey: (id: string) => del<void>(`/v1/auth/api-keys/${id}`),
};

// Billing
export const billing = {
  getBalance: () => get<BalanceResponse>('/v1/billing/balance'),
  getUsage: (page = 1) => get<UsageLogResponse[]>(`/v1/billing/usage?page=${page}`),
  getInvoices: () => get<InvoiceResponse[]>('/v1/billing/invoices'),
  createTopUp: (data: TopUpRequest) => post<TopUpResponse>('/v1/billing/top-up', data),
};

// Inference
export const inference = {
  listModels: () => get<ModelsResponse>('/v1/inference/models'),
  chatCompletion: (data: ChatCompletionRequest) => post<ChatCompletionResponse>('/v1/inference/chat/completions', data),
  chatCompletionStream: async function* (data: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/v1/inference/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...data, stream: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;
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
    formData.append('file', file);
    formData.append('engine', params.engine);
    if (params.frame_start !== undefined) formData.append('frame_start', String(params.frame_start));
    if (params.frame_end !== undefined) formData.append('frame_end', String(params.frame_end));
    if (params.samples !== undefined) formData.append('samples', String(params.samples));
    if (params.resolution_x !== undefined) formData.append('resolution_x', String(params.resolution_x));
    if (params.resolution_y !== undefined) formData.append('resolution_y', String(params.resolution_y));
    if (params.output_format) formData.append('output_format', params.output_format);
    return requestFormData<RenderJobResponse>('POST', '/v1/render/jobs', formData);
  },
  listJobs: () => get<RenderJobResponse[]>('/v1/render/jobs'),
  getJob: (id: string) => get<RenderJobResponse>(`/v1/render/jobs/${id}`),
  cancelJob: (id: string) => post<void>(`/v1/render/jobs/${id}/cancel`),
};

// Admin
export const admin = {
  getStats: () => get<SystemStatsResponse>('/v1/admin/stats'),
  listUsers: () => get<AdminUserResponse[]>('/v1/admin/users'),
  getUser: (id: string) => get<AdminUserResponse>(`/v1/admin/users/${id}`),
  updateUser: (id: string, data: UserUpdateRequest) => put<AdminUserResponse>(`/v1/admin/users/${id}`, data),
  adjustBalance: (id: string, data: AdjustBalanceRequest) => post<void>(`/v1/admin/users/${id}/balance`, data),
};

export { ApiError };
