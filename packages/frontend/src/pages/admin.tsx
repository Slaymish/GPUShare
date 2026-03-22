import { useState, useEffect, useCallback } from "react";
import { useWebHaptics } from "../lib/haptics";
import { admin, getHealth } from "../lib/api";
import type { HealthResponse, PowerData } from "../lib/api";
import { parseToken } from "../lib/auth";
import { Button, Input, Badge, StatCard } from "../components/ui";
import { fmtUsd } from "../lib/format";
import { useNavigate } from "@tanstack/react-router";
import type {
  AdminUserResponse,
  UserUpdateRequest,
  SystemStatsResponse,
  InviteListResponse,
} from "@shared/types/admin";

interface Integration {
  key: string;
  name: string;
  configured: boolean;
  description: string;
  setupUrl: string;
  setupLabel: string;
}

function getIntegrations(health: HealthResponse | null): Integration[] {
  const i = health?.integrations;
  return [
    {
      key: "ollama",
      name: "Ollama",
      configured: health?.ollama === "ready",
      description:
        "AI inference backend. Serves LLM models locally via an OpenAI-compatible API.",
      setupUrl: "https://ollama.com/download",
      setupLabel: "Install Ollama",
    },
    {
      key: "stripe",
      name: "Stripe",
      configured: i?.stripe ?? false,
      description:
        "Automated billing. Handles credit top-ups, monthly invoices, and payment collection.",
      setupUrl: "https://dashboard.stripe.com/apikeys",
      setupLabel: "Get API keys",
    },
    {
      key: "r2",
      name: "Cloudflare R2",
      configured: i?.r2 ?? false,
      description:
        "File storage for 3D rendering. Stores .blend uploads and rendered output with signed download URLs.",
      setupUrl: "https://dash.cloudflare.com/?to=/:account/r2/api-tokens",
      setupLabel: "Create R2 token",
    },
    {
      key: "resend",
      name: "Resend",
      configured: i?.resend ?? false,
      description:
        "Transactional email. Sends low-balance warnings, render completion notifications, and invoice receipts.",
      setupUrl: "https://resend.com/api-keys",
      setupLabel: "Get API key",
    },
    {
      key: "billing",
      name: "Billing",
      configured: i?.billing ?? false,
      description:
        "Usage-based billing at electricity cost. Requires Stripe to be configured first.",
      setupUrl: "",
      setupLabel: "Set BILLING_ENABLED=true in .env",
    },
    {
      key: "openrouter",
      name: "OpenRouter",
      configured: health?.integrations?.openrouter ?? false,
      description:
        "Cloud AI models (GPT-4o, Claude, etc). Users can access API models alongside local ones. Usage is billed at OpenRouter rates.",
      setupUrl: "https://openrouter.ai/keys",
      setupLabel: "Get API key",
    },
    {
      key: "tapo",
      name: "Tapo Smart Plug",
      configured: i?.tapo ?? false,
      description:
        "Real-time energy monitoring via a TP-Link Tapo P110. Measures actual power draw for accurate cost tracking instead of estimates.",
      setupUrl: "https://www.tapo.com/en/product/smart-plug/tapo-p110/",
      setupLabel: "Get a Tapo P110",
    },
  ];
}

export function AdminPage() {
  const [stats, setStats] = useState<SystemStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [invites, setInvites] = useState<InviteListResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const currentUserId = parseToken()?.sub ?? "";

  function fetchData() {
    Promise.all([
      admin
        .getStats()
        .then(setStats)
        .catch(() => {}),
      admin
        .listUsers()
        .then(setUsers)
        .catch(() => {}),
      getHealth()
        .then(setHealth)
        .catch(() => {}),
      admin
        .listInvites()
        .then(setInvites)
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Global keyboard listener for command palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) return <AdminSkeleton />;

  const integrations = getIntegrations(health);

  return (
    <div className="p-6 space-y-8 max-w-6xl pb-20 md:pb-12">
      <h2 className="text-lg font-semibold">Admin Dashboard</h2>

      {/* Setup Checklist */}
      <SetupChecklist
        integrations={integrations}
        health={health}
        userCount={users.length}
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Users" value={String(stats.total_users)} />
          <StatCard label="Active Users" value={String(stats.active_users)} />
          <StatCard
            label="Total Balance"
            value={fmtUsd(stats.total_balance_nzd)}
          />
          <StatCard
            label="Inference Cost"
            value={fmtUsd(stats.total_inference_cost_nzd)}
          />
          <StatCard
            label="Render Cost"
            value={fmtUsd(stats.total_render_cost_nzd)}
          />
          <StatCard label="Queue Size" value={String(stats.jobs_in_queue)} />
        </div>
      )}

      {/* Live Power */}
      {health?.power && <PowerWidget power={health.power} />}

      {/* Server Status */}
      {health && (
        <div className="bg-white rounded-xl p-5 border border-[#E5E1DB]">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-semibold">Server</h3>
            <span className="text-xs text-[#B1ADA1]">{health.node}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-[#6F6B66]">
            <span>Services: {health.services.join(", ")}</span>
            <span>
              Ollama: <OllamaStatus status={health.ollama} />
            </span>
            {health.ollama_models.length > 0 && (
              <span>Models: {health.ollama_models.join(", ")}</span>
            )}
          </div>
        </div>
      )}

      {/* Integrations */}
      <div>
        <h3 className="text-sm font-semibold text-[#6F6B66] mb-3">
          Integrations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((integ) => (
            <IntegrationTile key={integ.key} integration={integ} />
          ))}
        </div>
      </div>

      {/* Invite Links */}
      <InviteSection invites={invites} onRefresh={fetchData} />

      {/* Users Table */}
      <div>
        <h3 className="text-sm font-semibold text-[#6F6B66] mb-3">Users</h3>
        <div className="bg-white rounded-xl overflow-hidden border border-[#E5E1DB]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E1DB] text-[#6F6B66] text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUserId}
                  expanded={expandedUser === user.id}
                  onToggle={() =>
                    setExpandedUser(expandedUser === user.id ? null : user.id)
                  }
                  onRefresh={fetchData}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Command Palette */}
      {commandPaletteOpen && (
        <CommandPalette
          users={users}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup Checklist                                                    */
/* ------------------------------------------------------------------ */

function SetupChecklist({
  integrations,
  health,
  userCount,
}: {
  integrations: Integration[];
  health: HealthResponse | null;
  userCount: number;
}) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("gpushare_admin_checklist_dismissed") === "true";
  });
  const [collapsed, setCollapsed] = useState(false);

  const billingConfigured =
    integrations.find((i) => i.key === "billing")?.configured ?? false;
  const stripeConfigured =
    integrations.find((i) => i.key === "stripe")?.configured ?? false;
  const r2Configured =
    integrations.find((i) => i.key === "r2")?.configured ?? false;
  const hasInvitedUser = userCount > 1;

  const items = [
    { label: "Set electricity rate", checked: billingConfigured },
    { label: "Configure Cloudflare Tunnel", checked: true },
    { label: "Set up Stripe", checked: stripeConfigured },
    { label: "Configure R2", checked: r2Configured },
    { label: "Invite first user", checked: hasInvitedUser },
  ];

  const allDone = items.every((item) => item.checked);
  const anyNotConfigured = integrations.some((i) => !i.configured);

  // Don't show if dismissed or if everything is configured
  if (dismissed || (!anyNotConfigured && allDone)) return null;

  function handleDismiss() {
    localStorage.setItem("gpushare_admin_checklist_dismissed", "true");
    setDismissed(true);
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E1DB] overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-[#F4F3EE]"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Setup Checklist</h3>
          <span className="text-xs text-[#B1ADA1]">
            {items.filter((i) => i.checked).length}/{items.length} complete
          </span>
        </div>
        <span className="text-[#B1ADA1] text-xs">
          {collapsed ? "Show" : "Hide"}
        </span>
      </div>
      {!collapsed && (
        <div className="px-5 pb-4 space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3 text-sm">
              <span
                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs ${
                  item.checked
                    ? "bg-[#E8F5E9] text-[#2E7D32]"
                    : "bg-[#EDEAE3] text-[#B1ADA1]"
                }`}
              >
                {item.checked ? "\u2713" : "\u25A1"}
              </span>
              <span
                className={
                  item.checked ? "text-[#6F6B66] line-through" : "text-[#2C2925]"
                }
              >
                {item.label}
              </span>
            </div>
          ))}
          <div className="pt-2">
            <Button
              onClick={handleDismiss}
              variant="ghost"
              size="sm"
              className="text-xs text-[#B1ADA1] hover:text-[#6F6B66]"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Command Palette                                                    */
/* ------------------------------------------------------------------ */

function CommandPalette({
  users,
  onClose,
}: {
  users: AdminUserResponse[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const pages = [
    { label: "Go to Chat", path: "/chat" },
    { label: "Go to Render", path: "/render" },
    { label: "Go to Account", path: "/account" },
    { label: "Go to Admin", path: "/admin" },
  ];

  const lowerQuery = query.toLowerCase();

  const filteredPages = query
    ? pages.filter((p) => p.label.toLowerCase().includes(lowerQuery))
    : pages;

  const filteredUsers = query
    ? users.filter((u) => u.email.toLowerCase().includes(lowerQuery))
    : [];

  function handleNavigate(path: string) {
    onClose();
    navigate({ to: path });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#E5E1DB]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, users..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-[#B1ADA1]"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {filteredPages.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-semibold text-[#B1ADA1] uppercase tracking-wider">
                Pages
              </div>
              {filteredPages.map((page) => (
                <button
                  key={page.path}
                  onClick={() => handleNavigate(page.path)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#F4F3EE] transition-colors"
                >
                  {page.label}
                </button>
              ))}
            </div>
          )}
          {filteredUsers.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-semibold text-[#B1ADA1] uppercase tracking-wider">
                Users
              </div>
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleNavigate(`/admin`)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#F4F3EE] transition-colors"
                >
                  {user.email}
                </button>
              ))}
            </div>
          )}
          {filteredPages.length === 0 && filteredUsers.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[#B1ADA1]">
              No results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-[#E5E1DB] rounded animate-pulse ${className}`}
    />
  );
}

function AdminSkeleton() {
  return (
    <div className="p-6 space-y-8 max-w-6xl pb-20 md:pb-12">
      <SkeletonBlock className="h-6 w-48" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-4 border border-[#E5E1DB]"
          >
            <SkeletonBlock className="h-3 w-16 mb-2" />
            <SkeletonBlock className="h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Server status */}
      <div className="bg-white rounded-xl p-5 border border-[#E5E1DB]">
        <SkeletonBlock className="h-4 w-24 mb-3" />
        <SkeletonBlock className="h-3 w-64" />
      </div>

      {/* Integrations */}
      <div>
        <SkeletonBlock className="h-4 w-24 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-4 border border-[#E5E1DB]"
            >
              <div className="flex items-center justify-between mb-2">
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
              <SkeletonBlock className="h-3 w-full mb-1" />
              <SkeletonBlock className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>

      {/* Invite links */}
      <div>
        <SkeletonBlock className="h-4 w-24 mb-3" />
        <div className="bg-white rounded-xl p-5 border border-[#E5E1DB] space-y-3">
          <SkeletonBlock className="h-3 w-72" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
      </div>

      {/* Users table */}
      <div>
        <SkeletonBlock className="h-4 w-16 mb-3" />
        <div className="bg-white rounded-xl overflow-hidden border border-[#E5E1DB]">
          <div className="px-4 py-3 border-b border-[#E5E1DB]">
            <SkeletonBlock className="h-3 w-full" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-[#EDEBE6]">
              <SkeletonBlock className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function OllamaStatus({ status }: { status: string }) {
  if (status === "ready") return <span className="text-[#2E7D32]">ready</span>;
  if (status === "warming_up")
    return <span className="text-[#E65100]">warming up</span>;
  return <span className="text-[#C62828]">offline</span>;
}

function PowerWidget({ power }: { power: PowerData }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-[#E5E1DB]">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold">Live Power</h3>
        <span className="text-xs text-[#B1ADA1]">via Tapo P110</span>
        <span className="relative flex h-2 w-2 ml-1">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#2E7D32] opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2E7D32]" />
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <div className="text-2xl font-bold">
            {power.current_watts}
            <span className="text-sm font-normal text-[#6F6B66]">W</span>
          </div>
          <div className="text-xs text-[#B1ADA1]">Drawing now</div>
        </div>
        <div>
          <div className="text-lg font-semibold">
            {power.today_kwh}
            <span className="text-sm font-normal text-[#6F6B66]"> kWh</span>
          </div>
          <div className="text-xs text-[#B1ADA1]">Today</div>
        </div>
        <div>
          <div className="text-lg font-semibold">
            {power.month_kwh}
            <span className="text-sm font-normal text-[#6F6B66]"> kWh</span>
          </div>
          <div className="text-xs text-[#B1ADA1]">This month</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[#2E7D32]">
            {fmtUsd(power.today_cost)}
          </div>
          <div className="text-xs text-[#B1ADA1]">Cost today</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[#2E7D32]">
            {fmtUsd(power.month_cost)}
          </div>
          <div className="text-xs text-[#B1ADA1]">Cost this month</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-[#B1ADA1]">
        Rate: ${power.rate_per_kwh}/{power.currency} per kWh
      </div>
    </div>
  );
}

function IntegrationTile({ integration }: { integration: Integration }) {
  const { key, name, configured, description, setupUrl, setupLabel } =
    integration;
  const [healthStatus, setHealthStatus] = useState<{
    loading: boolean;
    status?: string;
    detail?: string;
  }>({ loading: false });

  async function handleTest() {
    setHealthStatus({ loading: true });
    try {
      const result = await admin.checkIntegrationHealth(key);
      setHealthStatus({
        loading: false,
        status: result.status,
        detail: result.detail,
      });
    } catch {
      setHealthStatus({
        loading: false,
        status: "error",
        detail: "Request failed",
      });
    }
  }

  return (
    <div
      className={`rounded-xl p-4 border ${configured ? "bg-white border-[#E5E1DB]" : "bg-[#F4F3EE] border-dashed border-[#D5D0C8]"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{name}</span>
        {configured ? (
          <span className="flex items-center gap-1.5 text-xs text-[#2E7D32]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2E7D32]" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-[#B1ADA1]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D5D0C8]" />
            Not configured
          </span>
        )}
      </div>
      <p className="text-xs text-[#6F6B66] mb-3 leading-relaxed">
        {description}
      </p>
      <div className="flex items-center gap-3">
        {!configured && setupUrl && (
          <a
            href={setupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-[#C15F3C] hover:text-[#A84E30] transition-colors"
          >
            {setupLabel} &rarr;
          </a>
        )}
        {!configured && !setupUrl && (
          <span className="text-xs text-[#B1ADA1]">{setupLabel}</span>
        )}
        <button
          onClick={handleTest}
          disabled={healthStatus.loading}
          className="text-xs text-[#6F6B66] hover:text-[#2C2925] transition-colors disabled:opacity-50"
        >
          {healthStatus.loading
            ? "Testing..."
            : healthStatus.status === "ok"
              ? "\u2713 OK"
              : healthStatus.status === "error"
                ? "\u2717 Error"
                : "Test"}
        </button>
        {healthStatus.status === "ok" && (
          <span className="text-xs text-[#2E7D32]">\u2713 OK</span>
        )}
        {healthStatus.status === "error" && healthStatus.detail && (
          <span className="text-xs text-[#C62828]" title={healthStatus.detail}>
            {healthStatus.detail}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Invite Section                                                     */
/* ------------------------------------------------------------------ */

function InviteSection({
  invites,
  onRefresh,
}: {
  invites: InviteListResponse[];
  onRefresh: () => void;
}) {
  const { trigger } = useWebHaptics();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    try {
      await admin.createInvite({ name: name || undefined, expires_in_days: 7 });
      trigger("success");
      setName("");
      onRefresh();
    } catch {}
    setCreating(false);
  }

  async function handleDelete(id: string) {
    trigger("buzz");
    await admin.deleteInvite(id).catch(() => {});
    onRefresh();
  }

  function copyInviteUrl(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    trigger("nudge");
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-[#6F6B66] mb-3">
        Invite Links
      </h3>
      <div className="bg-white rounded-xl p-5 space-y-4 border border-[#E5E1DB]">
        <p className="text-xs text-[#6F6B66]">
          Generate one-time invite links for new users. They'll get auto-provisioned with an account and API key.
        </p>

        <div className="flex flex-wrap gap-2">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Recipient name (optional)"
            className="flex-1 min-w-[200px]"
          />
          <Button
            onClick={handleCreate}
            disabled={creating}
            size="sm"
            className="whitespace-nowrap"
          >
            {creating ? "Creating..." : "Create Invite"}
          </Button>
        </div>

        {invites.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-[#E5E1DB] text-[#6F6B66] text-left">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Created</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Expires</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#EDEBE6]">
                    <td className="py-2">{inv.name || "-"}</td>
                    <td className="py-2 text-[#6F6B66]">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {inv.claimed_at ? (
                        <span className="text-[#2E7D32] text-xs">Claimed</span>
                      ) : inv.expires_at &&
                        new Date(inv.expires_at) < new Date() ? (
                        <span className="text-[#C62828] text-xs">Expired</span>
                      ) : (
                        <span className="text-[#E65100] text-xs">Pending</span>
                      )}
                    </td>
                    <td className="py-2 text-[#6F6B66] text-xs">
                      {inv.expires_at
                        ? new Date(inv.expires_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="py-2 space-x-2">
                      {!inv.claimed_at && (
                        <>
                          <Button
                            onClick={() => copyInviteUrl(inv.token)}
                            variant="ghost"
                            size="sm"
                            className="text-[#C15F3C] hover:text-[#A84E30] text-xs h-auto py-1"
                          >
                            {copiedToken === inv.token ? "Copied!" : "Copy Link"}
                          </Button>
                          <Button
                            onClick={() => handleDelete(inv.id)}
                            variant="ghost"
                            size="sm"
                            className="text-[#C62828] hover:text-[#B71C1C] text-xs h-auto py-1"
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  User Row                                                           */
/* ------------------------------------------------------------------ */

function usageBadgeVariant(
  amount: number,
): "green" | "amber" | "red" {
  if (amount < 1) return "green";
  if (amount < 5) return "amber";
  return "red";
}

function UserRow({
  user,
  isSelf,
  expanded,
  onToggle,
  onRefresh,
}: {
  user: AdminUserResponse;
  isSelf: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const { trigger } = useWebHaptics();
  const [status, setStatus] = useState(user.status);
  const [role, setRole] = useState(user.role);
  const [limit, setLimit] = useState(String(user.hard_limit_nzd));
  const [services, setServices] = useState(user.services_enabled.join(","));
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDesc, setAdjDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const update: UserUpdateRequest = {
      status,
      role,
      hard_limit_nzd: Number(limit),
      services_enabled: services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await admin.updateUser(user.id, update).catch(() => {});
    trigger("success");
    setSaving(false);
    onRefresh();
  }

  async function handleAdjust() {
    if (!adjAmount || !adjDesc) return;
    await admin
      .adjustBalance(user.id, {
        amount_nzd: Number(adjAmount),
        description: adjDesc,
      })
      .catch(() => {});
    setAdjAmount("");
    setAdjDesc("");
    onRefresh();
  }

  async function handleQuickAction(newStatus: string) {
    if (newStatus === "suspended") {
      trigger("buzz");
    } else {
      trigger("success");
    }
    await admin.updateUser(user.id, { status: newStatus }).catch(() => {});
    onRefresh();
  }

  return (
    <>
      <tr
        className="border-b border-[#EDEBE6] cursor-pointer hover:bg-[#F4F3EE]"
        onClick={onToggle}
      >
        <td className="px-4 py-3">{user.email}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs capitalize ${
              user.status === "active"
                ? "text-[#2E7D32]"
                : user.status === "pending"
                  ? "text-[#E65100]"
                  : "text-[#C62828]"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                user.status === "active"
                  ? "bg-[#2E7D32]"
                  : user.status === "pending"
                    ? "bg-[#E65100]"
                    : "bg-[#C62828]"
              }`}
            />
            {user.status}
          </span>
        </td>
        <td className="px-4 py-3 capitalize">{user.role}</td>
        <td className="px-4 py-3">{fmtUsd(user.balance_nzd)}</td>
        <td className="px-4 py-3">
          <Badge variant={usageBadgeVariant(user.monthly_usage_nzd)}>
            {fmtUsd(user.monthly_usage_nzd)}
          </Badge>
        </td>
        <td
          className="px-4 py-3 space-x-2"
          onClick={(e) => e.stopPropagation()}
        >
          {user.status === "pending" && (
            <Button
              onClick={() => handleQuickAction("active")}
              variant="ghost"
              size="sm"
              className="text-[#2E7D32] hover:text-[#1B5E20] text-xs h-auto py-1"
            >
              Approve
            </Button>
          )}
          {user.status === "active" && !isSelf && (
            <Button
              onClick={() => handleQuickAction("suspended")}
              variant="ghost"
              size="sm"
              className="text-[#C62828] hover:text-[#B71C1C] text-xs h-auto py-1"
            >
              Suspend
            </Button>
          )}
          {isSelf && <span className="text-xs text-[#B1ADA1]">You</span>}
          {user.status === "suspended" && (
            <Button
              onClick={() => handleQuickAction("active")}
              variant="ghost"
              size="sm"
              className="text-[#2E7D32] hover:text-[#1B5E20] text-xs h-auto py-1"
            >
              Reactivate
            </Button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td
            colSpan={6}
            className="px-4 py-4 bg-[#F4F3EE] border-b border-[#E5E1DB]"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-[#6F6B66] mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="w-full bg-[#EDEAE3] border border-[#E5E1DB] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#C15F3C]"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#6F6B66] mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="w-full bg-[#EDEAE3] border border-[#E5E1DB] rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#C15F3C]"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#6F6B66] mb-1">
                  Hard Limit ($)
                </label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[#6F6B66] mb-1">
                  Services (comma-sep)
                </label>
                <Input
                  type="text"
                  value={services}
                  onChange={(e) => setServices(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="mr-4"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>

            <div className="mt-4 pt-4 border-t border-[#E5E1DB]">
              <div className="text-xs text-[#6F6B66] mb-2">
                Balance Adjustment
              </div>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs text-[#6F6B66] mb-1">
                    Amount ($)
                  </label>
                  <Input
                    type="number"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    step="0.01"
                    className="w-28"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-[#6F6B66] mb-1">
                    Description
                  </label>
                  <Input
                    type="text"
                    value={adjDesc}
                    onChange={(e) => setAdjDesc(e.target.value)}
                    placeholder="Reason for adjustment"
                  />
                </div>
                <Button onClick={handleAdjust} variant="success" size="sm">
                  Adjust
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
