export interface SignupRequest {
  email: string;
  password: string;
  name?: string;
  bootstrap_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  status: "pending" | "active" | "suspended";
  role: "user" | "admin";
  billing_type: "postpaid" | "prepaid";
  hard_limit_nzd: number;
  services_enabled: string[];
  stripe_customer_id: string | null;
  created_at: string;
}

export interface ApiKeyCreateRequest {
  label?: string;
}

export interface ApiKeyCreateResponse {
  key: string;
  id: string;
  label: string | null;
  created_at: string;
}

export interface ApiKeyResponse {
  id: string;
  label: string | null;
  last_used: string | null;
  created_at: string;
  revoked_at: string | null;
}
