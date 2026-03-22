import { Outlet, Link, useRouterState } from "@tanstack/react-router";
import { isAuthenticated, parseToken, clearToken } from "../lib/auth";
import { useEffect, useState } from "react";
import { useWebHaptics } from "../lib/haptics";
import { billing, getHealth } from "../lib/api";
import type { HealthResponse } from "../lib/api";
import { router } from "../router";
import {
  branding,
  status as statusConfig,
  balanceThresholds,
} from "../theme.config";
import { Button } from "./ui";
import { fmtUsd } from "../lib/format";

type ServerStatus = "online" | "warming_up" | "degraded" | "offline";

function useServerStatus(authed: boolean): {
  status: ServerStatus;
  health: HealthResponse | null;
} {
  const [status, setStatus] = useState<ServerStatus>("offline");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    if (!authed) return;

    let mounted = true;

    async function check() {
      try {
        const h = await getHealth();
        if (!mounted) return;
        setHealth(h);
        if (h.ollama === "ready") {
          setStatus("online");
        } else if (h.ollama === "warming_up") {
          setStatus("warming_up");
        } else {
          setStatus("degraded");
        }
      } catch {
        if (!mounted) return;
        setHealth(null);
        setStatus("offline");
      }
    }

    check();
    const interval = setInterval(check, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [authed]);

  return { status, health };
}

function StatusPill({ status }: { status: ServerStatus }) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F4F3EE] text-xs">
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ backgroundColor: config.color }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: config.color }}
        />
      </span>
      <span className="text-[#6F6B66]">{config.label}</span>
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function RenderIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function AdminIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Chat: ChatIcon,
  Render: RenderIcon,
  Account: AccountIcon,
  Admin: AdminIcon,
};

export function Layout() {
  const { trigger } = useWebHaptics();
  const routerState = useRouterState();
  const isLoginPage = routerState.location.pathname === "/login";
  const authed = isAuthenticated();
  const payload = parseToken();
  const isAdmin = payload?.role === "admin";

  const [balance, setBalance] = useState<number | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status, health } = useServerStatus(authed);
  const billingEnabled =
    (health?.integrations?.billing && health?.integrations?.stripe) ?? false;

  useEffect(() => {
    if (!authed) return;
    billing
      .getBalance()
      .then((b) => setBalance(b.balance_nzd))
      .catch(() => {});
    import("../lib/api").then(({ auth }) =>
      auth
        .getMe()
        .then((u) => setEmail(u.email))
        .catch(() => {}),
    );
  }, [authed, routerState.location.pathname]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [routerState.location.pathname]);

  if (isLoginPage || !authed) {
    return (
      <div className="min-h-screen bg-[#F4F3EE] text-[#2D2B28]">
        <Outlet />
      </div>
    );
  }

  const navItems = [
    { to: "/chat" as const, label: "Chat" },
    { to: "/render" as const, label: "Render" },
    { to: "/account" as const, label: "Account" },
    ...(isAdmin ? [{ to: "/admin" as const, label: "Admin" }] : []),
  ];

  function handleLogout() {
    trigger("nudge");
    clearToken();
    router.navigate({ to: "/login" });
  }

  const currentPath = routerState.location.pathname;

  return (
    <div className="flex h-screen bg-[#F4F3EE] text-[#2D2B28] overflow-hidden max-w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white flex-col border-r border-[#E5E1DB] fixed left-0 top-0 bottom-0">
        <div className="p-6 border-b border-[#E5E1DB]">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              {branding.appName}
            </h1>
            <StatusPill status={status} />
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              activeProps={{ className: "bg-[#F4F3EE] text-[#2D2B28]" }}
              inactiveProps={{
                className:
                  "text-[#6F6B66] hover:text-[#2D2B28] hover:bg-[#F4F3EE]",
              }}
              onMouseDown={() => trigger("nudge")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-[#E5E1DB] space-y-2">
          {billingEnabled && balance !== null && (
            <div className="text-sm">
              <span className="text-[#6F6B66]">
                {balance < 0 ? "Debt: " : "Balance: "}
              </span>
              <span
                className={
                  balance > balanceThresholds.high
                    ? "text-[#2E7D32]"
                    : balance > balanceThresholds.medium
                      ? "text-[#E65100]"
                      : balance > balanceThresholds.low
                        ? "text-[#EF6C00]"
                        : "text-[#C62828]"
                }
              >
                {fmtUsd(balance)}
              </span>
            </div>
          )}
          {email && (
            <div className="text-xs text-[#B1ADA1] truncate">{email}</div>
          )}
          <Button
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className="w-full justify-start"
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-white border-b border-[#E5E1DB]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => {
                trigger("nudge");
                setSidebarOpen(true);
              }}
              className="text-[#6F6B66] hover:text-[#2D2B28] flex-shrink-0"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight truncate">
              {branding.appName}
            </h1>
          </div>
          <div className="flex-shrink-0">
            <StatusPill status={status} />
          </div>
        </div>
      </div>

      {/* Mobile Slide-over Sidebar */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] bg-white flex flex-col md:hidden">
            <div className="p-4 border-b border-[#E5E1DB] flex items-center justify-between">
              <h1 className="text-lg font-bold tracking-tight">
                {branding.appName}
              </h1>
              <button
                onClick={() => {
                  trigger("nudge");
                  setSidebarOpen(false);
                }}
                className="text-[#6F6B66] hover:text-[#2D2B28]"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {billingEnabled && balance !== null && (
                <div className="text-sm">
                  <span className="text-[#6F6B66]">
                    {balance < 0 ? "Debt: " : "Balance: "}
                  </span>
                  <span
                    className={
                      balance > 10
                        ? "text-[#2E7D32]"
                        : balance > 5
                          ? "text-[#E65100]"
                          : balance > 0
                            ? "text-[#EF6C00]"
                            : "text-[#C62828]"
                    }
                  >
                    {fmtUsd(balance)}
                  </span>
                </div>
              )}
              {email && (
                <div className="text-sm text-[#6F6B66] truncate">{email}</div>
              )}
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-[#C62828] hover:text-[#B71C1C]"
              >
                Logout
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0 pb-16 md:pb-0 min-w-0 w-full md:ml-64">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-[#E5E1DB] max-w-full"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {navItems.map((item) => {
            const Icon = iconMap[item.label];
            const isActive = currentPath.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
                  isActive ? "text-[#C15F3C]" : "text-[#B1ADA1]"
                }`}
                onMouseDown={() => trigger("nudge")}
              >
                {Icon && <Icon className="w-5 h-5" />}
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
