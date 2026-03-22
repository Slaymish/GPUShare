import { useState, useEffect, useMemo } from "react";
import { useWebHaptics } from "../lib/haptics";
import { auth as authApi, billing, getHealth } from "../lib/api";
import type { HealthResponse } from "../lib/api";
import type { UserResponse, ApiKeyResponse } from "@shared/types/auth";
import type {
  BalanceResponse,
  UsageLogResponse,
  InvoiceResponse,
} from "@shared/types/billing";
import { Button, Input, StatCard, RelativeTime } from "../components/ui";
import { PaymentMethodSetup } from "../components/PaymentMethodSetup";
import { fmtUsd } from "../lib/format";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-[#E5E1DB] rounded animate-pulse ${className}`}
    />
  );
}

function AccountSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl pb-20 md:pb-0 w-full">
      <SkeletonBlock className="h-6 w-32" />

      {/* Balance card */}
      <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
        <SkeletonBlock className="h-3 w-16 mb-2" />
        <SkeletonBlock className="h-9 w-28 mb-3" />
        <div className="flex gap-4">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>

      {/* Usage limit card */}
      <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
        <SkeletonBlock className="h-4 w-24 mb-2" />
        <SkeletonBlock className="h-3 w-72 mb-3" />
        <SkeletonBlock className="h-9 w-48" />
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
        <SkeletonBlock className="h-4 w-16 mb-3" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-3 w-32" />
          ))}
        </div>
      </div>

      {/* API Keys card */}
      <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB] space-y-4">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-9 w-full" />
        <SkeletonBlock className="h-3 w-24" />
      </div>

      {/* Usage Log card */}
      <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB] space-y-4">
        <SkeletonBlock className="h-4 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

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
  const [paymentMethods, setPaymentMethods] = useState<
    Array<{
      id: string;
      card_brand: string;
      card_last4: string;
      card_exp_month: number;
      card_exp_year: number;
    }>
  >([]);
  const [settingUpPayment, setSettingUpPayment] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);
  const [guideTab, setGuideTab] = useState<'curl' | 'python' | 'claude-code' | 'openclaw'>('curl');

  const billingEnabled =
    (health?.integrations?.billing && health?.integrations?.stripe) ?? false;

  // Compute usage statistics from loaded usage data
  const usageStats = useMemo(() => {
    const inferenceCount = usage.length;
    const totalKwh = usage.reduce((sum, u) => sum + u.kwh, 0);
    const inferenceCost = usage.reduce((sum, u) => sum + u.cost_nzd, 0);
    const totalUsed = balance?.total_used_nzd ?? 0;
    const renderCost = Math.max(0, totalUsed - inferenceCost);
    return { inferenceCount, totalKwh, inferenceCost, renderCost, totalUsed };
  }, [usage, balance]);

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
      billing
        .listPaymentMethods()
        .then(setPaymentMethods)
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.all([
      authApi.getMe(),
      billing.getBalance(),
      billing.getUsage(),
      billing.getInvoices(),
      authApi.listApiKeys(),
      getHealth(),
      billing.listPaymentMethods(),
    ])
      .then(([u, b, usage, inv, keys, h, pm]) => {
        setUser(u);
        setBalance(b);
        setUsage(usage);
        setInvoices(inv);
        setApiKeys(keys);
        setHealth(h);
        setPaymentMethods(pm);
        setLimitInput(u.hard_limit_nzd.toString());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    if (b > 20) return "text-[#2E7D32]";
    if (b > 10) return "text-[#E65100]";
    if (b > 0) return "text-[#EF6C00]";
    return "text-[#C62828]";
  }

  if (loading) return <AccountSkeleton />;

  const curlSnippet = `curl ${API_URL}/v1/inference/chat/completions \\
  -H "Authorization: Bearer ${revealedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "llama3", "messages": [{"role": "user", "content": "Hello"}]}'`;

  const pythonSnippet = `from openai import OpenAI
client = OpenAI(base_url="${API_URL}/v1/inference", api_key="${revealedKey}")
response = client.chat.completions.create(
    model="llama3",
    messages=[{"role": "user", "content": "Hello"}]
)
print(response.choices[0].message.content)`;

  const claudeCodeSnippet = `# Add to your shell profile (~/.zshrc or ~/.bashrc)
export ANTHROPIC_BASE_URL="${API_URL}/v1"
export ANTHROPIC_AUTH_TOKEN="${revealedKey}"

# Then restart Claude Code`;

  const openClawConfig = JSON.stringify(
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

  // Donut chart percentages
  const totalCostForDonut = usageStats.inferenceCost + usageStats.renderCost;
  const inferencePct = totalCostForDonut > 0 ? (usageStats.inferenceCost / totalCostForDonut) * 100 : 100;
  const renderPct = totalCostForDonut > 0 ? (usageStats.renderCost / totalCostForDonut) * 100 : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl pb-20 md:pb-0 w-full">
      {/* Low-balance sticky warning banner */}
      {billingEnabled &&
        balance &&
        balance.balance_nzd < 5 &&
        balance.balance_nzd > 0 &&
        !dismissed && (
          <div className="bg-[#FFF3E0] border border-[#FFE0B2] text-[#E65100] rounded-lg px-4 py-3 flex items-center justify-between text-sm">
            <span>
              Low balance: {fmtUsd(balance.balance_nzd)} NZD remaining{" "}
              <button
                onClick={() => {
                  const topUpSection = document.getElementById("balance-card");
                  topUpSection?.scrollIntoView({ behavior: "smooth" });
                }}
                className="underline font-medium hover:text-[#BF360C]"
              >
                Top up
              </button>
            </span>
            <button
              onClick={() => setDismissed(true)}
              className="ml-4 text-[#E65100] hover:text-[#BF360C] font-medium"
            >
              x
            </button>
          </div>
        )}

      <h2 className="text-lg font-semibold">Account</h2>

      {/* Balance Card */}
      {billingEnabled && balance && (
        <div
          id="balance-card"
          className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]"
        >
          <div className="text-sm text-[#6F6B66] mb-1">
            {balance.billing_type === "postpaid" && balance.balance_nzd < 0
              ? "Current Debt"
              : balance.billing_type === "postpaid"
                ? "Credit"
                : "Balance"}
          </div>
          <div
            className={`text-4xl font-bold ${balanceColor(balance.balance_nzd)}`}
          >
            {fmtUsd(balance.balance_nzd)}
          </div>
          <div className="mt-3 text-sm text-[#6F6B66] flex flex-wrap gap-x-4 gap-y-1">
            <span>
              This month:{" "}
              <span className="text-[#2D2B28]">
                {fmtUsd(balance.this_month_usage_nzd)}
              </span>
            </span>
            <span>
              Limit:{" "}
              <span className="text-[#2D2B28]">
                {fmtUsd(balance.hard_limit_nzd)}
              </span>
            </span>
            <span>
              Type:{" "}
              <span className="text-[#2D2B28] capitalize">
                {balance.billing_type}
              </span>
            </span>
          </div>

          {/* Credit balance breakdown */}
          <div className="mt-2 text-sm text-[#6F6B66] flex flex-wrap gap-x-4 gap-y-1">
            {balance.total_topped_up_nzd !== undefined && (
              <span>
                Total topped up:{" "}
                <span className="text-[#2E7D32]">
                  {fmtUsd(balance.total_topped_up_nzd)}
                </span>
              </span>
            )}
            {balance.total_used_nzd !== undefined && (
              <span>
                Total used:{" "}
                <span className="text-[#C62828]">
                  {fmtUsd(balance.total_used_nzd)}
                </span>
              </span>
            )}
          </div>

          {balance.billing_type === "prepaid" && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-sm text-[#6F6B66]">$</span>
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

      {/* Billing Information for Postpaid Users */}
      {billingEnabled && balance?.billing_type === "postpaid" && (
        <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
          <h3 className="font-medium mb-3">Billing & Payments</h3>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-[#2D2B28] mb-2">
                Invoice Schedule
              </h4>
              <p className="text-sm text-[#6F6B66]">
                Invoices are automatically generated on the{" "}
                <strong className="text-[#2D2B28]">1st of each month</strong> for
                the previous month's usage. You'll receive an email with your
                invoice and payment instructions.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-[#2D2B28] mb-2">
                Payment Methods
              </h4>
              <p className="text-sm text-[#6F6B66] mb-3">
                You can pay invoices manually via the emailed link, or set up
                automatic payments by adding a payment method below.
              </p>

              {paymentMethods.length > 0 ? (
                <div className="space-y-3">
                  {paymentMethods.map((pm) => (
                    <div
                      key={pm.id}
                      className="flex items-center justify-between p-3 bg-[#F4F3EE] border border-[#E5E1DB] rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-[#2E7D32]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <div className="text-sm">
                          <div className="text-[#2D2B28] capitalize">
                            {pm.card_brand} •••• {pm.card_last4}
                          </div>
                          <div className="text-xs text-[#B1ADA1]">
                            Expires {pm.card_exp_month}/{pm.card_exp_year}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={async () => {
                          if (confirm("Remove this payment method?")) {
                            try {
                              await billing.deletePaymentMethod(pm.id);
                              setPaymentMethods(
                                paymentMethods.filter((p) => p.id !== pm.id),
                              );
                              trigger("success");
                            } catch (err) {
                              alert("Failed to remove payment method");
                            }
                          }
                        }}
                        variant="ghost"
                        size="sm"
                        className="text-[#C62828] hover:text-[#B71C1C]"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Button
                  onClick={async () => {
                    setSettingUpPayment(true);
                    try {
                      const { client_secret } =
                        await billing.setupPaymentMethod();
                      setSetupClientSecret(client_secret);
                    } catch (err) {
                      alert("Failed to setup payment method");
                    } finally {
                      setSettingUpPayment(false);
                    }
                  }}
                  disabled={settingUpPayment}
                  size="sm"
                >
                  {settingUpPayment
                    ? "Setting up..."
                    : "Add Payment Method for Auto-Pay"}
                </Button>
              )}
            </div>

            <div className="pt-3 border-t border-[#E5E1DB]">
              <p className="text-xs text-[#B1ADA1]">
                Next invoice:{" "}
                <strong className="text-[#6F6B66]">1st of next month</strong> •
                Covers usage from start to end of current month
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Usage Limit */}
      {billingEnabled && user && (
        <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
          <h3 className="font-medium mb-2">Usage Limit</h3>
          <p className="text-sm text-[#6F6B66] mb-3">
            {balance?.billing_type === "postpaid"
              ? "Maximum debt allowed before service is suspended. Set as a negative number (e.g., -20 for $20 debt limit)."
              : "Minimum balance required to continue service. You'll be blocked when your balance drops below this amount."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#6F6B66]">$</span>
            <Input
              type="number"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              step="1"
              placeholder={balance?.billing_type === "postpaid" ? "-20" : "0"}
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
        <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
          <h3 className="font-medium mb-3">Profile</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <span className="text-[#6F6B66]">Email</span>
            <span>{user.email}</span>
            <span className="text-[#6F6B66]">Name</span>
            <span>{user.name || "-"}</span>
            <span className="text-[#6F6B66]">Status</span>
            <span className="capitalize">{user.status}</span>
            <span className="text-[#6F6B66]">Role</span>
            <span className="capitalize">{user.role}</span>
            <span className="text-[#6F6B66]">Services</span>
            <span>{user.services_enabled.join(", ") || "None"}</span>
            <span className="text-[#6F6B66]">Member since</span>
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="bg-white rounded-xl p-4 md:p-6 space-y-4 border border-[#E5E1DB]">
        <h3 className="font-medium">API Keys</h3>

        {revealedKey && (
          <div className="bg-[#E8F5E9] border border-[#C8E6C9] rounded-lg p-3">
            <div className="text-xs text-[#2E7D32] mb-1">
              Copy this key now - it won't be shown again:
            </div>
            <code className="text-sm text-[#1B5E20] break-all block">
              {revealedKey}
            </code>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(revealedKey);
                trigger("nudge");
              }}
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-[#2E7D32] hover:text-[#1B5E20]"
            >
              Copy to clipboard
            </Button>

            {/* Integration Guide Tabs */}
            <div className="mt-4">
              <div className="flex border-b border-[#C8E6C9]">
                {(
                  [
                    { key: "curl", label: "curl" },
                    { key: "python", label: "Python" },
                    { key: "claude-code", label: "Claude Code" },
                    { key: "openclaw", label: "OpenClaw" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setGuideTab(tab.key)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      guideTab === tab.key
                        ? "text-[#C15F3C] border-b-2 border-[#C15F3C]"
                        : "text-[#6F6B66] hover:text-[#2D2B28]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {guideTab === "curl" && (
                  <div>
                    <pre className="bg-white border border-[#E5E1DB] rounded-lg p-3 text-xs text-[#2D2B28] overflow-x-auto whitespace-pre-wrap">
                      {curlSnippet}
                    </pre>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(curlSnippet);
                        trigger("nudge");
                      }}
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs text-[#2E7D32] hover:text-[#1B5E20]"
                    >
                      Copy
                    </Button>
                  </div>
                )}

                {guideTab === "python" && (
                  <div>
                    <pre className="bg-white border border-[#E5E1DB] rounded-lg p-3 text-xs text-[#2D2B28] overflow-x-auto whitespace-pre-wrap">
                      {pythonSnippet}
                    </pre>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(pythonSnippet);
                        trigger("nudge");
                      }}
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs text-[#2E7D32] hover:text-[#1B5E20]"
                    >
                      Copy
                    </Button>
                  </div>
                )}

                {guideTab === "claude-code" && (
                  <div className="bg-white border border-[#E5E1DB] rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <img
                        src="/claude-logo.svg"
                        alt="Claude"
                        className="w-5 h-5"
                      />
                      <span className="text-sm font-medium">Claude Code</span>
                    </div>
                    <p className="text-xs text-[#6F6B66] mb-2">
                      Configure Claude Code to use GPUShare as LLM gateway
                    </p>
                    <div className="space-y-2">
                      <pre className="bg-[#F4F3EE] border border-[#E5E1DB] rounded-lg p-3 text-xs text-[#2D2B28] overflow-x-auto whitespace-pre-wrap">
                        {claudeCodeSnippet}
                      </pre>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(claudeCodeSnippet);
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
                        className="block text-center text-xs text-[#C15F3C] hover:text-[#A84E30]"
                      >
                        View Setup Guide
                      </a>
                    </div>
                  </div>
                )}

                {guideTab === "openclaw" && (
                  <div className="bg-white border border-[#E5E1DB] rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <img
                        src="/openclaw-dark.svg"
                        alt="OpenClaw"
                        className="w-5 h-5"
                      />
                      <span className="text-sm font-medium">OpenClaw</span>
                    </div>
                    <p className="text-xs text-[#6F6B66] mb-2">
                      Add GPUShare as custom provider
                    </p>
                    <div className="space-y-2">
                      <pre className="bg-[#F4F3EE] border border-[#E5E1DB] rounded-lg p-3 text-xs text-[#2D2B28] overflow-x-auto whitespace-pre-wrap">
                        {openClawConfig}
                      </pre>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(openClawConfig);
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
                        className="block text-center text-xs text-[#C15F3C] hover:text-[#A84E30]"
                      >
                        View Setup Guide
                      </a>
                    </div>
                  </div>
                )}
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
                <tr className="border-b border-[#E5E1DB] text-[#6F6B66] text-left">
                  <th className="py-2 font-medium">Label</th>
                  <th className="py-2 font-medium">Created</th>
                  <th className="py-2 font-medium">Last Used</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} className="border-b border-[#EDEBE6]">
                    <td className="py-2">{k.label || "-"}</td>
                    <td className="py-2 text-[#6F6B66]">
                      <RelativeTime date={k.created_at} />
                    </td>
                    <td className="py-2 text-[#6F6B66]">
                      {k.last_used ? (
                        <RelativeTime date={k.last_used} />
                      ) : (
                        "Never"
                      )}
                    </td>
                    <td className="py-2">
                      {k.revoked_at ? (
                        <span className="text-[#C62828]">Revoked</span>
                      ) : (
                        <span className="text-[#2E7D32]">Active</span>
                      )}
                    </td>
                    <td className="py-2">
                      {!k.revoked_at && (
                        <Button
                          onClick={() => handleRevokeKey(k.id)}
                          variant="ghost"
                          size="sm"
                          className="text-[#C62828] hover:text-[#B71C1C] text-xs h-auto py-1"
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
          <p className="text-sm text-[#B1ADA1]">No API keys</p>
        )}
      </div>

      {/* Usage Statistics */}
      <div className="space-y-4">
        <h3 className="font-medium">Usage Statistics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Inference Requests"
            value={usageStats.inferenceCount.toLocaleString()}
            subLabel="From loaded usage logs"
          />
          <StatCard
            label="Render Jobs"
            value={usageStats.renderCost > 0 ? Math.ceil(usageStats.renderCost / 0.01).toString() : "\u2014"}
            subLabel="Estimated from cost data"
          />
          <StatCard
            label="Total kWh"
            value={usageStats.totalKwh.toFixed(4)}
            subLabel="Energy consumed"
          />
        </div>

        {/* Donut chart: inference vs render cost split */}
        {totalCostForDonut > 0 && (
          <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
            <h4 className="text-sm font-medium mb-4">Cost Breakdown</h4>
            <div className="flex items-center gap-6">
              <div
                className="w-24 h-24 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{
                  background: `conic-gradient(#C15F3C ${inferencePct}%, #5E35B1 ${inferencePct}% 100%)`,
                }}
              >
                <div className="w-14 h-14 rounded-full bg-white" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#C15F3C]" />
                  <span className="text-[#6F6B66]">Inference</span>
                  <span className="font-medium">{fmtUsd(usageStats.inferenceCost)}</span>
                  <span className="text-[#B1ADA1]">({inferencePct.toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#5E35B1]" />
                  <span className="text-[#6F6B66]">Render</span>
                  <span className="font-medium">{fmtUsd(usageStats.renderCost)}</span>
                  <span className="text-[#B1ADA1]">({renderPct.toFixed(1)}%)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage Log */}
      <div className="bg-white rounded-xl p-4 md:p-6 space-y-4 border border-[#E5E1DB]">
        <h3 className="font-medium">Usage Log</h3>
        {usage.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-[#E5E1DB] text-[#6F6B66] text-left">
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
                    <tr key={u.id} className="border-b border-[#EDEBE6]">
                      <td className="py-2">{u.model}</td>
                      <td className="py-2 text-[#6F6B66]">
                        {u.input_tokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-[#6F6B66]">
                        {u.output_tokens.toLocaleString()}
                      </td>
                      {billingEnabled && (
                        <td className="py-2">${u.cost_nzd.toFixed(4)}</td>
                      )}
                      <td className="py-2 text-[#6F6B66]">{u.kwh.toFixed(4)}</td>
                      <td className="py-2 text-[#6F6B66]">
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
                Previous
              </Button>
              <span className="text-[#B1ADA1]">
                Showing {usageOffset + 1}-{usageOffset + usage.length}
              </span>
              <Button
                onClick={() => setUsageOffset((o) => o + 50)}
                disabled={usage.length < 50}
                variant="ghost"
                size="sm"
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#B1ADA1]">No usage records</p>
        )}
      </div>

      {/* Invoices */}
      {billingEnabled && (
        <div className="bg-white rounded-xl p-4 md:p-6 space-y-4 border border-[#E5E1DB]">
          <h3 className="font-medium">Invoices</h3>
          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-[#E5E1DB] text-[#6F6B66] text-left">
                    <th className="py-2 font-medium">Period</th>
                    <th className="py-2 font-medium">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-[#EDEBE6]">
                      <td className="py-2">
                        {new Date(inv.period_start).toLocaleDateString()} -{" "}
                        {new Date(inv.period_end).toLocaleDateString()}
                      </td>
                      <td className="py-2">${inv.amount_nzd.toFixed(2)}</td>
                      <td className="py-2 capitalize">{inv.status}</td>
                      <td className="py-2 text-[#6F6B66]">
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
            <p className="text-sm text-[#B1ADA1]">No invoices</p>
          )}
        </div>
      )}

      {/* Payment Method Setup Modal */}
      {setupClientSecret && (
        <PaymentMethodSetup
          clientSecret={setupClientSecret}
          onSuccess={async () => {
            setSetupClientSecret(null);
            trigger("success");
            const pm = await billing.listPaymentMethods();
            setPaymentMethods(pm);
          }}
          onCancel={() => {
            setSetupClientSecret(null);
          }}
        />
      )}
    </div>
  );
}
