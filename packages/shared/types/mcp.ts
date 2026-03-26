export interface McpServerCreate {
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerUpdate {
  name?: string;
  transport?: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerResponse {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error_message?: string;
  tool_count: number;
  created_at: string;
}

export interface McpToolInfo {
  server_id: string;
  server_name: string;
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface McpToolsResponse {
  tools: McpToolInfo[];
}

export interface McpToolCallRequest {
  server_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolCallResponse {
  result: unknown;
  is_error: boolean;
}
