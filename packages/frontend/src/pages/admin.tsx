import { useState, useEffect } from "react";
import { useWebHaptics } from "../lib/haptics";
import { admin, getHealth } from "../lib/api";
import type { HealthResponse, PowerData } from "../lib/api";
import { parseToken } from "../lib/auth";
import { Button, Input } from "../components/ui";
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

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  const integrations = getIntegrations(health);

  return (
    <div className="p-6 space-y-8 max-w-6xl pb-20 md:pb-0">
      <h2 className="text-lg font-semibold">Admin Dashboard</h2>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Users" value={String(stats.total_users)} />
          <StatCard label="Active Users" value={String(stats.active_users)} />
          <StatCard
            label="Inference Cost"
            value={`$${stats.total_inference_cost_nzd.toFixed(2)}`}
          />
          <StatCard
            label="Render Cost"
            value={`$${stats.total_render_cost_nzd.toFixed(2)}`}
          />
          <StatCard label="Queue Size" value={String(stats.jobs_in_queue)} />
        </div>
      )}

      {/* Live Power — Tapo Smart Plug */}
      {health?.power && <PowerWidget power={health.power} />}

      {/* Server Status */}
      {health && (
        <div className="bg-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-200">Server</h3>
            <span className="text-xs text-gray-500">{health.node}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
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
        <h3 className="text-sm font-semibold text-gray-300 mb-3">
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
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Users</h3>
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Balance</th>
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
    </div>
  );
}

function OllamaStatus({ status }: { status: string }) {
  if (status === "ready") return <span className="text-green-400">ready</span>;
  if (status === "warming_up")
    return <span className="text-yellow-400">warming up</span>;
  return <span className="text-red-400">offline</span>;
}

function PowerWidget({ power }: { power: PowerData }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Live Power</h3>
        <span className="text-xs text-gray-500">via Tapo P110</span>
        <span className="relative flex h-2 w-2 ml-1">
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <div className="text-2xl font-bold">
            {power.current_watts}
            <span className="text-sm font-normal text-gray-400">W</span>
          </div>
          <div className="text-xs text-gray-500">Drawing now</div>
        </div>
        <div>
          <div className="text-lg font-semibold">
            {power.today_kwh}
            <span className="text-sm font-normal text-gray-400"> kWh</span>
          </div>
          <div className="text-xs text-gray-500">Today</div>
        </div>
        <div>
          <div className="text-lg font-semibold">
            {power.month_kwh}
            <span className="text-sm font-normal text-gray-400"> kWh</span>
          </div>
          <div className="text-xs text-gray-500">This month</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-green-400">
            ${power.today_cost.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Cost today</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-green-400">
            ${power.month_cost.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Cost this month</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        Rate: ${power.rate_per_kwh}/{power.currency} per kWh
      </div>
    </div>
  );
}

function IntegrationTile({ integration }: { integration: Integration }) {
  const { name, configured, description, setupUrl, setupLabel } = integration;
  return (
    <div
      className={`rounded-xl p-4 border ${configured ? "bg-gray-800 border-gray-700" : "bg-gray-800/50 border-dashed border-gray-700"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{name}</span>
        {configured ? (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-600" />
            Not configured
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
        {description}
      </p>
      {!configured && setupUrl && (
        <a
          href={setupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {setupLabel} &rarr;
        </a>
      )}
      {!configured && !setupUrl && (
        <span className="text-xs text-gray-500">{setupLabel}</span>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

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
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        Invite Links
      </h3>
      <div className="bg-gray-800 rounded-xl p-5 space-y-4">
        <p className="text-xs text-gray-400">
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
                <tr className="border-b border-gray-700 text-gray-400 text-left">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Created</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Expires</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-700/50">
                    <td className="py-2">{inv.name || "-"}</td>
                    <td className="py-2 text-gray-400">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {inv.claimed_at ? (
                        <span className="text-green-400 text-xs">Claimed</span>
                      ) : inv.expires_at &&
                        new Date(inv.expires_at) < new Date() ? (
                        <span className="text-red-400 text-xs">Expired</span>
                      ) : (
                        <span className="text-yellow-400 text-xs">Pending</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-400 text-xs">
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
                            className="text-blue-400 hover:text-blue-300 text-xs h-auto py-1"
                          >
                            {copiedToken === inv.token ? "Copied!" : "Copy Link"}
                          </Button>
                          <Button
                            onClick={() => handleDelete(inv.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 text-xs h-auto py-1"
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
        className="border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/30"
        onClick={onToggle}
      >
        <td className="px-4 py-3">{user.email}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs capitalize ${
              user.status === "active"
                ? "text-green-400"
                : user.status === "pending"
                  ? "text-yellow-400"
                  : "text-red-400"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                user.status === "active"
                  ? "bg-green-400"
                  : user.status === "pending"
                    ? "bg-yellow-400"
                    : "bg-red-400"
              }`}
            />
            {user.status}
          </span>
        </td>
        <td className="px-4 py-3 capitalize">{user.role}</td>
        <td className="px-4 py-3">${user.balance_nzd.toFixed(2)}</td>
        <td
          className="px-4 py-3 space-x-2"
          onClick={(e) => e.stopPropagation()}
        >
          {user.status === "pending" && (
            <Button
              onClick={() => handleQuickAction("active")}
              variant="ghost"
              size="sm"
              className="text-green-400 hover:text-green-300 text-xs h-auto py-1"
            >
              Approve
            </Button>
          )}
          {user.status === "active" && !isSelf && (
            <Button
              onClick={() => handleQuickAction("suspended")}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 text-xs h-auto py-1"
            >
              Suspend
            </Button>
          )}
          {isSelf && <span className="text-xs text-gray-500">You</span>}
          {user.status === "suspended" && (
            <Button
              onClick={() => handleQuickAction("active")}
              variant="ghost"
              size="sm"
              className="text-green-400 hover:text-green-300 text-xs h-auto py-1"
            >
              Reactivate
            </Button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td
            colSpan={5}
            className="px-4 py-4 bg-gray-850 border-b border-gray-700"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Hard Limit ($)
                </label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
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

            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-2">
                Balance Adjustment
              </div>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
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
                  <label className="block text-xs text-gray-400 mb-1">
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
