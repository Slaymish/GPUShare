export interface BalanceResponse {
  balance_nzd: number;
  this_month_usage_nzd: number;
  hard_limit_nzd: number;
  billing_type: string;
  total_topped_up_nzd: number;
  total_used_nzd: number;
}

export interface UsageLogResponse {
  id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_nzd: number;
  kwh: number;
  created_at: string;
}

export interface InvoiceResponse {
  id: string;
  period_start: string;
  period_end: string;
  amount_nzd: number;
  status: 'pending' | 'paid' | 'failed' | 'void';
  created_at: string;
  paid_at: string | null;
}

export interface TopUpRequest {
  amount_nzd: number;
}

export interface TopUpResponse {
  checkout_url: string;
}
