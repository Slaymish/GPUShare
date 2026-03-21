import { useState, useEffect } from "react";
import { useWebHaptics } from "../lib/haptics";
import { auth as authApi, billing, getHealth } from "../lib/api";
import type { HealthResponse } from "../lib/api";
import type { UserResponse, ApiKeyResponse } from "@shared/types/auth";
import type {
  BalanceResponse,
  UsageLogResponse,
  InvoiceResponse,
} from "@shared/types/billing";
import { Button, Input } from "../components/ui";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function AccountPage() {
  const { trigger } = useWebHaptics();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [usage, setUsage] = useState<UsageLogResponse[]>([]);
  const [usageOffset, setUsageOffset] = useState(0);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [limitSaving, setLimitSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const billingEnabled =
    (health?.integrations?.billing && health?.integrations?.stripe) ?? false;

  function fetchAll() {
    Promise.all([
      authApi
        .getMe()
        .then((u) => {
          setUser(u);
          setLimitInput(String(u.hard_limit_nzd));
        })
        .catch(() => {}),
      billing
        .getBalance()
        .then(setBalance)
        .catch(() => {}),
      billing
        .getUsage(50, usageOffset)
        .then(setUsage)
        .catch(() => {}),
      billing
        .getInvoices()
        .then(setInvoices)
        .catch(() => {}),
      authApi
        .listApiKeys()
        .then(setApiKeys)
        .catch(() => {}),
      getHealth()
        .then(setHealth)
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    billing
      .getUsage(50, usageOffset)
      .then(setUsage)
      .catch(() => {});
  }, [usageOffset]);

  async function handleCreateKey() {
    try {
      const res = await authApi.createApiKey({
        label: newKeyLabel || undefined,
      });
      setRevealedKey(res.key);
      setNewKeyLabel("");
      authApi
        .listApiKeys()
        .then(setApiKeys)
        .catch(() => {});
      trigger("success");
    } catch {}
  }

  async function handleRevokeKey(id: string) {
    trigger("buzz");
    await authApi.revokeApiKey(id).catch(() => {});
    authApi
      .listApiKeys()
      .then(setApiKeys)
      .catch(() => {});
  }

  async function handleTopUp() {
    try {
      const res = await billing.createTopUp({
        amount_nzd: Number(topUpAmount),
      });
      window.location.href = res.checkout_url;
    } catch {}
  }

  async function handleSaveLimit() {
    setLimitSaving(true);
    try {
      const res = await authApi.updateMyLimit(Number(limitInput));
      setLimitInput(String(res.hard_limit_nzd));
      trigger("success");
    } catch {}
    setLimitSaving(false);
  }

  function balanceColor(b: number): string {
    if (b > 20) return "text-green-400";
    if (b > 10) return "text-yellow-400";
    if (b > 0) return "text-orange-400";
    return "text-red-400";
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl pb-20 md:pb-0 w-full">
      <h2 className="text-lg font-semibold">Account</h2>

      {/* Balance Card — only when billing enabled */}
      {billingEnabled && balance && (
        <div className="bg-gray-800 rounded-xl p-4 md:p-6">
          <div className="text-sm text-gray-400 mb-1">Balance</div>
          <div
            className={`text-4xl font-bold ${balanceColor(balance.balance_nzd)}`}
          >
            ${balance.balance_nzd.toFixed(2)}
          </div>
          <div className="mt-3 text-sm text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              This month:{" "}
              <span className="text-white">
                ${balance.this_month_usage_nzd.toFixed(2)}
              </span>
            </span>
            <span>
              Limit:{" "}
              <span className="text-white">
                ${balance.hard_limit_nzd.toFixed(2)}
              </span>
            </span>
            <span>
              Type:{" "}
              <span className="text-white capitalize">
                {balance.billing_type}
              </span>
            </span>
          </div>

          {balance.billing_type === "prepaid" && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-sm text-gray-400">$</span>
              <Input
                type="number"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                min={1}
                className="w-24"
              />
              <Button
                onClick={handleTopUp}
                variant="success"
                size="sm"
                className="whitespace-nowrap"
              >
                Top Up
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Usage Limit — user can set their own */}
      {billingEnabled && user && (
        <div className="bg-gray-800 rounded-xl p-4 md:p-6">
          <h3 className="font-medium mb-2">Usage Limit</h3>
          <p className="text-sm text-gray-400 mb-3">
            Set a personal spending limit. You'll be blocked from making
            requests when your balance drops below this amount.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-400">$</span>
            <Input
              type="number"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              step="1"
              className="w-28"
            />
            <Button
              onClick={handleSaveLimit}
              disabled={limitSaving}
              size="sm"
              className="whitespace-nowrap"
            >
              {limitSaving ? "Saving..." : "Update Limit"}
            </Button>
          </div>
        </div>
      )}

      {/* User Info */}
      {user && (
        <div className="bg-gray-800 rounded-xl p-4 md:p-6">
          <h3 className="font-medium mb-3">Profile</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <span className="text-gray-400">Email</span>
            <span>{user.email}</span>
            <span className="text-gray-400">Name</span>
            <span>{user.name || "-"}</span>
            <span className="text-gray-400">Status</span>
            <span className="capitalize">{user.status}</span>
            <span className="text-gray-400">Role</span>
            <span className="capitalize">{user.role}</span>
            <span className="text-gray-400">Services</span>
            <span>{user.services_enabled.join(", ") || "None"}</span>
            <span className="text-gray-400">Member since</span>
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="bg-gray-800 rounded-xl p-4 md:p-6 space-y-4">
        <h3 className="font-medium">API Keys</h3>

        {revealedKey && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
            <div className="text-xs text-green-300 mb-1">
              Copy this key now - it won't be shown again:
            </div>
            <code className="text-sm text-green-200 break-all block">
              {revealedKey}
            </code>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(revealedKey);
                trigger("nudge");
              }}
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-green-400 hover:text-green-300"
            >
              Copy to clipboard
            </Button>

            {/* Integration Panels */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Claude Code Integration */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src="/claude-logo.svg"
                    alt="Claude"
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-medium">Claude Code</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  Configure Claude Code to use GPUShare as LLM gateway
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      const envConfig = `# Add to your shell profile (~/.zshrc or ~/.bashrc)
export ANTHROPIC_BASE_URL="${API_URL}/v1"
export ANTHROPIC_AUTH_TOKEN="${revealedKey}"

# Then restart Claude Code`;
                      navigator.clipboard.writeText(envConfig);
                      trigger("nudge");
                    }}
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                  >
                    Copy Environment Setup
                  </Button>
                  <a
                    href="https://code.claude.com/docs/en/llm-gateway"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Setup Guide →
                  </a>
                </div>
              </div>

              {/* OpenClaw Integration */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src="/openclaw-dark.svg"
                    alt="OpenClaw"
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-medium">OpenClaw</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  Add GPUShare as custom provider
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      const config = JSON.stringify(
                        {
                          models: {
                            providers: {
                              gpushare: {
                                baseUrl: `${API_URL}/v1`,
                                apiKey: revealedKey,
                                api: "openai-completions",
                                models: [
                                  {
                                    id: "gpt-4",
                                    name: "GPUShare GPT-4",
                                    reasoning: false,
                                    input: ["text"],
                                    cost: {
                                      input: 0,
                                      output: 0,
                                      cacheRead: 0,
                                      cacheWrite: 0,
                                    },
                                    contextWindow: 128000,
                                    maxTokens: 4096,
                                  },
                                ],
                              },
                            },
                          },
                        },
                        null,
                        2,
                      );
                      navigator.clipboard.writeText(config);
                      trigger("nudge");
                    }}
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                  >
                    Copy models.json Config
                  </Button>
                  <a
                    href="https://docs.openclaw.ai/concepts/model-providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Setup Guide →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Input
            type="text"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="Key label (optional)"
            className="flex-1 min-w-[200px]"
          />
          <Button
            onClick={handleCreateKey}
            size="sm"
            className="whitespace-nowrap"
          >
            Create Key
          </Button>
        </div>

        {apiKeys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-left">
                  <th className="py-2 font-medium">Label</th>
                  <th className="py-2 font-medium">Created</th>
                  <th className="py-2 font-medium">Last Used</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-700/50">
                    <td className="py-2">{k.label || "-"}</td>
                    <td className="py-2 text-gray-400">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-gray-400">
                      {k.last_used
                        ? new Date(k.last_used).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="py-2">
                      {k.revoked_at ? (
                        <span className="text-red-400">Revoked</span>
                      ) : (
                        <span className="text-green-400">Active</span>
                      )}
                    </td>
                    <td className="py-2">
                      {!k.revoked_at && (
                        <Button
                          onClick={() => handleRevokeKey(k.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 text-xs h-auto py-1"
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No API keys</p>
        )}
      </div>

      {/* Usage Log */}
      <div className="bg-gray-800 rounded-xl p-4 md:p-6 space-y-4">
        <h3 className="font-medium">Usage Log</h3>
        {usage.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="py-2 font-medium">Model</th>
                    <th className="py-2 font-medium">In Tokens</th>
                    <th className="py-2 font-medium">Out Tokens</th>
                    {billingEnabled && (
                      <th className="py-2 font-medium">Cost</th>
                    )}
                    <th className="py-2 font-medium">kWh</th>
                    <th className="py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.id} className="border-b border-gray-700/50">
                      <td className="py-2">{u.model}</td>
                      <td className="py-2 text-gray-400">
                        {u.input_tokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-gray-400">
                        {u.output_tokens.toLocaleString()}
                      </td>
                      {billingEnabled && (
                        <td className="py-2">${u.cost_nzd.toFixed(4)}</td>
                      )}
                      <td className="py-2 text-gray-400">{u.kwh.toFixed(4)}</td>
                      <td className="py-2 text-gray-400">
                        {new Date(u.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Button
                disabled={usageOffset <= 0}
                onClick={() => setUsageOffset((o) => Math.max(0, o - 50))}
                variant="ghost"
                size="sm"
              >
                ← Previous
              </Button>
              <span className="text-gray-500">
                Showing {usageOffset + 1}-{usageOffset + usage.length}
              </span>
              <Button
                onClick={() => setUsageOffset((o) => o + 50)}
                disabled={usage.length < 50}
                variant="ghost"
                size="sm"
              >
                Next →
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No usage records</p>
        )}
      </div>

      {/* Invoices — only when billing enabled */}
      {billingEnabled && (
        <div className="bg-gray-800 rounded-xl p-4 md:p-6 space-y-4">
          <h3 className="font-medium">Invoices</h3>
          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="py-2 font-medium">Period</th>
                    <th className="py-2 font-medium">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-700/50">
                      <td className="py-2">
                        {new Date(inv.period_start).toLocaleDateString()} -{" "}
                        {new Date(inv.period_end).toLocaleDateString()}
                      </td>
                      <td className="py-2">${inv.amount_nzd.toFixed(2)}</td>
                      <td className="py-2 capitalize">{inv.status}</td>
                      <td className="py-2 text-gray-400">
                        {inv.paid_at
                          ? new Date(inv.paid_at).toLocaleDateString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No invoices</p>
          )}
        </div>
      )}
    </div>
  );
}
