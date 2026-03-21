import { useState, useEffect } from 'react';
import { admin } from '../lib/api';
import type { AdminUserResponse, UserUpdateRequest } from '@shared/types/admin';
import type { SystemStatsResponse } from '@shared/types/admin';

export function AdminPage() {
  const [stats, setStats] = useState<SystemStatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  function fetchData() {
    Promise.all([
      admin.getStats().then(setStats).catch(() => {}),
      admin.listUsers().then(setUsers).catch(() => {}),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, []);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h2 className="text-lg font-semibold">Admin Dashboard</h2>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Users" value={String(stats.total_users)} />
          <StatCard label="Active Users" value={String(stats.active_users)} />
          <StatCard label="Inference Cost" value={`$${stats.total_inference_cost_nzd.toFixed(2)}`} />
          <StatCard label="Render Cost" value={`$${stats.total_render_cost_nzd.toFixed(2)}`} />
          <StatCard label="Queue Size" value={String(stats.jobs_in_queue)} />
        </div>
      )}

      {/* Users Table */}
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
            {users.map(user => (
              <UserRow
                key={user.id}
                user={user}
                expanded={expandedUser === user.id}
                onToggle={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                onRefresh={fetchData}
              />
            ))}
          </tbody>
        </table>
      </div>
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

function UserRow({
  user,
  expanded,
  onToggle,
  onRefresh,
}: {
  user: AdminUserResponse;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [status, setStatus] = useState(user.status);
  const [role, setRole] = useState(user.role);
  const [limit, setLimit] = useState(String(user.hard_limit_nzd));
  const [services, setServices] = useState(user.services_enabled.join(','));
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDesc, setAdjDesc] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const update: UserUpdateRequest = {
      status,
      role,
      hard_limit_nzd: Number(limit),
      services_enabled: services.split(',').map(s => s.trim()).filter(Boolean),
    };
    await admin.updateUser(user.id, update).catch(() => {});
    setSaving(false);
    onRefresh();
  }

  async function handleAdjust() {
    if (!adjAmount || !adjDesc) return;
    await admin.adjustBalance(user.id, { amount_nzd: Number(adjAmount), description: adjDesc }).catch(() => {});
    setAdjAmount('');
    setAdjDesc('');
    onRefresh();
  }

  async function handleQuickAction(newStatus: string) {
    await admin.updateUser(user.id, { status: newStatus }).catch(() => {});
    onRefresh();
  }

  return (
    <>
      <tr className="border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/30" onClick={onToggle}>
        <td className="px-4 py-3">{user.email}</td>
        <td className="px-4 py-3 capitalize">{user.status}</td>
        <td className="px-4 py-3 capitalize">{user.role}</td>
        <td className="px-4 py-3">${user.balance_nzd.toFixed(2)}</td>
        <td className="px-4 py-3 space-x-2" onClick={e => e.stopPropagation()}>
          {user.status === 'pending' && (
            <button onClick={() => handleQuickAction('active')} className="text-green-400 hover:text-green-300 text-xs">Approve</button>
          )}
          {user.status === 'active' && (
            <button onClick={() => handleQuickAction('suspended')} className="text-red-400 hover:text-red-300 text-xs">Suspend</button>
          )}
          {user.status === 'suspended' && (
            <button onClick={() => handleQuickAction('active')} className="text-green-400 hover:text-green-300 text-xs">Reactivate</button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-4 bg-gray-850 border-b border-gray-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role</label>
                <select value={role} onChange={e => setRole(e.target.value as typeof role)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Hard Limit ($)</label>
                <input type="number" value={limit} onChange={e => setLimit(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Services (comma-sep)</label>
                <input type="text" value={services} onChange={e => setServices(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors mr-4">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-2">Balance Adjustment</div>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amount ($)</label>
                  <input type="number" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} step="0.01"
                    className="w-28 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <input type="text" value={adjDesc} onChange={e => setAdjDesc(e.target.value)} placeholder="Reason for adjustment"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <button onClick={handleAdjust}
                  className="bg-green-600 hover:bg-green-700 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors">
                  Adjust
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
