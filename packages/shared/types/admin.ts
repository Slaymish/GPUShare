import type { UserResponse } from './auth';

export interface AdminUserResponse extends UserResponse {
  balance_nzd: number;
  monthly_usage_nzd: number;
}

export interface UserUpdateRequest {
  status?: string;
  role?: string;
  hard_limit_nzd?: number;
  services_enabled?: string[];
}

export interface AdjustBalanceRequest {
  amount_nzd: number;
  description: string;
}

export interface SystemStatsResponse {
  total_users: number;
  active_users: number;
  total_inference_cost_nzd: number;
  total_render_cost_nzd: number;
  total_balance_nzd: number;
  jobs_in_queue: number;
}

export interface InviteCreateRequest {
  name?: string;
  expires_in_days?: number;
}

export interface InviteCreateResponse {
  invite_url: string;
  token: string;
  name?: string;
  expires_at?: string;
}

export interface InviteListResponse {
  id: string;
  token: string;
  name?: string;
  created_at: string;
  claimed_at?: string;
  expires_at?: string;
}
