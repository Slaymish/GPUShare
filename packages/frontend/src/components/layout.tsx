import { Outlet, Link, useRouterState } from '@tanstack/react-router';
import { isAuthenticated, parseToken, clearToken } from '../lib/auth';
import { useEffect, useState } from 'react';
import { billing, getHealth } from '../lib/api';
import type { HealthResponse } from '../lib/api';
import { router } from '../router';

type ServerStatus = 'online' | 'warming_up' | 'degraded' | 'offline';

function useServerStatus(authed: boolean): { status: ServerStatus; health: HealthResponse | null } {
  const [status, setStatus] = useState<ServerStatus>('offline');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    if (!authed) return;

    let mounted = true;

    async function check() {
      try {
        const h = await getHealth();
        if (!mounted) return;
        setHealth(h);
        if (h.ollama === 'ready') {
          setStatus('online');
        } else if (h.ollama === 'warming_up') {
          setStatus('warming_up');
        } else {
          setStatus('degraded');
        }
      } catch {
        if (!mounted) return;
        setHealth(null);
        setStatus('offline');
      }
    }

    check();
    const interval = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, [authed]);

  return { status, health };
}

function StatusPill({ status }: { status: ServerStatus }) {
  const config = {
    online: { color: 'bg-green-500', label: 'Online', pulse: false },
    warming_up: { color: 'bg-yellow-500', label: 'Warming up', pulse: true },
    degraded: { color: 'bg-orange-500', label: 'Degraded', pulse: false },
    offline: { color: 'bg-red-500', label: 'Offline', pulse: false },
  }[status];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/50 text-xs">
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75 animate-ping`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`} />
      </span>
      <span className="text-gray-300">{config.label}</span>
    </div>
  );
}

export function Layout() {
  const routerState = useRouterState();
  const isLoginPage = routerState.location.pathname === '/login';
  const authed = isAuthenticated();
  const payload = parseToken();
  const isAdmin = payload?.role === 'admin';

  const [balance, setBalance] = useState<number | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const { status, health } = useServerStatus(authed);
  const billingEnabled = (health?.integrations?.billing && health?.integrations?.stripe) ?? false;

  useEffect(() => {
    if (!authed) return;
    billing.getBalance().then(b => setBalance(b.balance_nzd)).catch(() => {});
    import('../lib/api').then(({ auth }) =>
      auth.getMe().then(u => setEmail(u.email)).catch(() => {})
    );
  }, [authed, routerState.location.pathname]);

  if (isLoginPage || !authed) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Outlet />
      </div>
    );
  }

  const navItems = [
    { to: '/chat' as const, label: 'Chat' },
    { to: '/render' as const, label: 'Render' },
    { to: '/account' as const, label: 'Account' },
    ...(isAdmin ? [{ to: '/admin' as const, label: 'Admin' }] : []),
  ];

  function handleLogout() {
    clearToken();
    router.navigate({ to: '/login' });
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <aside className="w-64 bg-gray-950 flex flex-col border-r border-gray-800">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">GPU Node</h1>
            <StatusPill status={status} />
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              activeProps={{ className: 'bg-gray-800 text-white' }}
              inactiveProps={{ className: 'text-gray-400 hover:text-white hover:bg-gray-800/50' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800 space-y-2">
          {billingEnabled && balance !== null && (
            <div className="text-sm">
              <span className="text-gray-400">Balance: </span>
              <span className={balance > 10 ? 'text-green-400' : balance > 5 ? 'text-yellow-400' : balance > 0 ? 'text-orange-400' : 'text-red-400'}>
                ${balance.toFixed(2)}
              </span>
            </div>
          )}
          {email && <div className="text-xs text-gray-500 truncate">{email}</div>}
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-gray-400 hover:text-white px-2 py-1 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
