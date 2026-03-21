import { useState, useEffect } from 'react';
import { auth as authApi, billing, getHealth } from '../lib/api';
import type { HealthResponse } from '../lib/api';
import type { UserResponse, ApiKeyResponse } from '@shared/types/auth';
import type { BalanceResponse, UsageLogResponse, InvoiceResponse } from '@shared/types/billing';

export function AccountPage() {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [usage, setUsage] = useState<UsageLogResponse[]>([]);
  const [usageOffset, setUsageOffset] = useState(0);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('10');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const billingEnabled = (health?.integrations?.billing && health?.integrations?.stripe) ?? false;

  function fetchAll() {
    Promise.all([
      authApi.getMe().then(u => { setUser(u); setLimitInput(String(u.hard_limit_nzd)); }).catch(() => {}),
      billing.getBalance().then(setBalance).catch(() => {}),
      billing.getUsage(50, usageOffset).then(setUsage).catch(() => {}),
      billing.getInvoices().then(setInvoices).catch(() => {}),
      authApi.listApiKeys().then(setApiKeys).catch(() => {}),
      getHealth().then(setHealth).catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    billing.getUsage(50, usageOffset).then(setUsage).catch(() => {});
  }, [usageOffset]);

  async function handleCreateKey() {
    try {
      const res = await authApi.createApiKey({ label: newKeyLabel || undefined });
      setRevealedKey(res.key);
      setNewKeyLabel('');
      authApi.listApiKeys().then(setApiKeys).catch(() => {});
    } catch {}
  }

  async function handleRevokeKey(id: string) {
    await authApi.revokeApiKey(id).catch(() => {});
    authApi.listApiKeys().then(setApiKeys).catch(() => {});
  }

  async function handleTopUp() {
    try {
      const res = await billing.createTopUp({ amount_nzd: Number(topUpAmount) });
      window.location.href = res.checkout_url;
    } catch {}
  }

  async function handleSaveLimit() {
    setLimitSaving(true);
    try {
      const res = await authApi.updateMyLimit(Number(limitInput));
      setLimitInput(String(res.hard_limit_nzd));
    } catch {}
    setLimitSaving(false);
  }

  function balanceColor(b: number): string {
    if (b > 20) return 'text-green-400';
    if (b > 10) return 'text-yellow-400';
    if (b > 0) return 'text-orange-400';
    return 'text-red-400';
  }

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h2 className="text-lg font-semibold">Account</h2>

      {/* Balance Card — only when billing enabled */}
      {billingEnabled && balance && (
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="text-sm text-gray-400 mb-1">Balance</div>
          <div className={`text-4xl font-bold ${balanceColor(balance.balance_nzd)}`}>
            ${balance.balance_nzd.toFixed(2)}
          </div>
          <div className="mt-3 text-sm text-gray-400">
            This month: <span className="text-white">${balance.this_month_usage_nzd.toFixed(2)}</span>
            <span className="mx-2">|</span>
            Limit: <span className="text-white">${balance.hard_limit_nzd.toFixed(2)}</span>
            <span className="mx-2">|</span>
            Type: <span className="text-white capitalize">{balance.billing_type}</span>
          </div>

          {balance.billing_type === 'prepaid' && (
            <div className="flex items-center gap-2 mt-4">
              <span className="text-sm text-gray-400">$</span>
              <input
                type="number"
                value={topUpAmount}
                onChange={e => setTopUpAmount(e.target.value)}
                min={1}
                className="w-24 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleTopUp}
                className="bg-green-600 hover:bg-green-700 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
              >
                Top Up
              </button>
            </div>
          )}
        </div>
      )}

      {/* Usage Limit — user can set their own */}
      {billingEnabled && user && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h3 className="font-medium mb-2">Usage Limit</h3>
          <p className="text-sm text-gray-400 mb-3">
            Set a personal spending limit. You'll be blocked from making requests when your balance drops below this amount.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">$</span>
            <input
              type="number"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              step="1"
              className="w-28 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSaveLimit}
              disabled={limitSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
            >
              {limitSaving ? 'Saving...' : 'Update Limit'}
            </button>
          </div>
        </div>
      )}

      {/* User Info */}
      {user && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h3 className="font-medium mb-3">Profile</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-400">Email</span><span>{user.email}</span>
            <span className="text-gray-400">Name</span><span>{user.name || '-'}</span>
            <span className="text-gray-400">Status</span><span className="capitalize">{user.status}</span>
            <span className="text-gray-400">Role</span><span className="capitalize">{user.role}</span>
            <span className="text-gray-400">Services</span><span>{user.services_enabled.join(', ') || 'None'}</span>
            <span className="text-gray-400">Member since</span><span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="font-medium">API Keys</h3>

        {revealedKey && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
            <div className="text-xs text-green-300 mb-1">Copy this key now - it won't be shown again:</div>
            <code className="text-sm text-green-200 break-all">{revealedKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(revealedKey); }} className="ml-2 text-xs text-green-400 hover:text-green-300">Copy</button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyLabel}
            onChange={e => setNewKeyLabel(e.target.value)}
            placeholder="Key label (optional)"
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <button onClick={handleCreateKey} className="bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors">
            Create Key
          </button>
        </div>

        {apiKeys.length > 0 ? (
          <table className="w-full text-sm">
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
              {apiKeys.map(k => (
                <tr key={k.id} className="border-b border-gray-700/50">
                  <td className="py-2">{k.label || '-'}</td>
                  <td className="py-2 text-gray-400">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="py-2 text-gray-400">{k.last_used ? new Date(k.last_used).toLocaleDateString() : 'Never'}</td>
                  <td className="py-2">{k.revoked_at ? <span className="text-red-400">Revoked</span> : <span className="text-green-400">Active</span>}</td>
                  <td className="py-2">
                    {!k.revoked_at && (
                      <button onClick={() => handleRevokeKey(k.id)} className="text-red-400 hover:text-red-300 text-xs">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No API keys</p>
        )}
      </div>

      {/* Usage Log */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="font-medium">Usage Log</h3>
        {usage.length > 0 ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-left">
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 font-medium">In Tokens</th>
                  <th className="py-2 font-medium">Out Tokens</th>
                  {billingEnabled && <th className="py-2 font-medium">Cost</th>}
                  <th className="py-2 font-medium">kWh</th>
                  <th className="py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {usage.map(u => (
                  <tr key={u.id} className="border-b border-gray-700/50">
                    <td className="py-2">{u.model}</td>
                    <td className="py-2 text-gray-400">{u.input_tokens.toLocaleString()}</td>
                    <td className="py-2 text-gray-400">{u.output_tokens.toLocaleString()}</td>
                    {billingEnabled && <td className="py-2">${u.cost_nzd.toFixed(4)}</td>}
                    <td className="py-2 text-gray-400">{u.kwh.toFixed(4)}</td>
                    <td className="py-2 text-gray-400">{new Date(u.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 text-sm">
              <button disabled={usageOffset <= 0} onClick={() => setUsageOffset(o => Math.max(0, o - 50))}
                className="text-gray-400 hover:text-white disabled:opacity-30">Previous</button>
              <span className="text-gray-500">Showing {usageOffset + 1}-{usageOffset + usage.length}</span>
              <button onClick={() => setUsageOffset(o => o + 50)} disabled={usage.length < 50}
                className="text-gray-400 hover:text-white disabled:opacity-30">Next</button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No usage records</p>
        )}
      </div>

      {/* Invoices — only when billing enabled */}
      {billingEnabled && (
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <h3 className="font-medium">Invoices</h3>
          {invoices.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-left">
                  <th className="py-2 font-medium">Period</th>
                  <th className="py-2 font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-700/50">
                    <td className="py-2">{new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}</td>
                    <td className="py-2">${inv.amount_nzd.toFixed(2)}</td>
                    <td className="py-2 capitalize">{inv.status}</td>
                    <td className="py-2 text-gray-400">{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">No invoices</p>
          )}
        </div>
      )}
    </div>
  );
}
