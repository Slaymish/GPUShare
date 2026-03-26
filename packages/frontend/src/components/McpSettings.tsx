import { useState, useEffect } from "react";
import { mcpServers } from "../lib/api";
import type {
  McpServerResponse,
  McpServerCreate,
} from "@shared/types/mcp";
import { Button, Input, Badge } from "./ui";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-[#4CAF50]"
      : status === "error"
        ? "bg-[#C62828]"
        : status === "connecting"
          ? "bg-[#FFA000] animate-pulse"
          : "bg-[#B1ADA1]";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export function McpSettings() {
  const [servers, setServers] = useState<McpServerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newTransport, setNewTransport] = useState<"stdio" | "sse">("stdio");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEnvKeys, setNewEnvKeys] = useState("");
  const [newEnvVals, setNewEnvVals] = useState("");
  const [adding, setAdding] = useState(false);

  // Expanded server for editing env vars
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadServers() {
    try {
      const data = await mcpServers.list();
      setServers(data);
    } catch {
      // silently fail — servers may not be set up yet
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServers();
  }, []);

  function resetForm() {
    setNewName("");
    setNewTransport("stdio");
    setNewCommand("");
    setNewArgs("");
    setNewUrl("");
    setNewEnvKeys("");
    setNewEnvVals("");
    setShowAdd(false);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);

    try {
      // Parse env vars from key=value lines
      const env: Record<string, string> = {};
      if (newEnvKeys.trim()) {
        for (const line of newEnvKeys.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const eq = trimmed.indexOf("=");
          if (eq > 0) {
            env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
          }
        }
      }

      const data: McpServerCreate = {
        name: newName.trim(),
        transport: newTransport,
        ...(newTransport === "stdio"
          ? {
              command: newCommand.trim() || undefined,
              args: newArgs.trim()
                ? newArgs.split(/\s+/).filter(Boolean)
                : undefined,
            }
          : {
              url: newUrl.trim() || undefined,
            }),
        env: Object.keys(env).length > 0 ? env : undefined,
        enabled: true,
      };

      const created = await mcpServers.create(data);
      setServers((prev) => [...prev, created]);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await mcpServers.delete(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete server");
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await mcpServers.update(id, { enabled: !enabled });
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update server");
    }
  }

  async function handleConnect(id: string) {
    try {
      setServers((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "connecting" as const } : s,
        ),
      );
      const updated = await mcpServers.connect(id);
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setServers((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "error" as const,
                error_message:
                  err instanceof Error ? err.message : "Connection failed",
              }
            : s,
        ),
      );
    }
  }

  async function handleDisconnect(id: string) {
    try {
      const updated = await mcpServers.disconnect(id);
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
        <div className="h-4 w-32 bg-[#E5E1DB] rounded animate-pulse mb-2" />
        <div className="h-3 w-64 bg-[#E5E1DB] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 md:p-6 border border-[#E5E1DB]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-[#2D2B28]">MCP Servers</h3>
          <p className="text-xs text-[#8A8580] mt-0.5">
            Connect external tool servers to use with any model that supports
            tool calling
          </p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="text-sm">
          {showAdd ? "Cancel" : "+ Add Server"}
        </Button>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#FFEBEE] text-[#C62828] text-xs">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 hover:underline"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Add server form */}
      {showAdd && (
        <div className="mb-4 p-4 rounded-lg border border-[#E5E1DB] bg-[#F4F3EE] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6F6B66] mb-1 block">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Trade Me"
              />
            </div>
            <div>
              <label className="text-xs text-[#6F6B66] mb-1 block">
                Transport
              </label>
              <Select
                value={newTransport}
                onValueChange={(v) => setNewTransport(v as "stdio" | "sse")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">Stdio (local command)</SelectItem>
                  <SelectItem value="sse">SSE (remote URL)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {newTransport === "stdio" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#6F6B66] mb-1 block">
                  Command
                </label>
                <Input
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  placeholder="e.g. python"
                />
              </div>
              <div>
                <label className="text-xs text-[#6F6B66] mb-1 block">
                  Arguments (space-separated)
                </label>
                <Input
                  value={newArgs}
                  onChange={(e) => setNewArgs(e.target.value)}
                  placeholder="e.g. -m trademe_mcp.server"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-[#6F6B66] mb-1 block">
                Server URL
              </label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="e.g. http://localhost:3001/sse"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-[#6F6B66] mb-1 block">
              Environment Variables (KEY=VALUE, one per line)
            </label>
            <textarea
              value={newEnvKeys}
              onChange={(e) => setNewEnvKeys(e.target.value)}
              placeholder={"TRADEME_CONSUMER_KEY=your_key\nTRADEME_CONSUMER_SECRET=your_secret"}
              rows={3}
              className="w-full rounded-lg border border-[#E5E1DB] px-3 py-2 text-sm font-mono bg-white placeholder:text-[#B1ADA1] focus:outline-none focus:ring-2 focus:ring-[#C15F3C] focus:border-transparent"
            />
          </div>

          <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
            {adding ? "Adding..." : "Add Server"}
          </Button>
        </div>
      )}

      {/* Server list */}
      {servers.length === 0 && !showAdd && (
        <div className="text-center py-6 text-sm text-[#B1ADA1]">
          No MCP servers configured yet. Add one to get started.
        </div>
      )}

      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.id}
            className="rounded-lg border border-[#E5E1DB] bg-[#FAFAF8]"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <StatusDot status={server.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-[#2D2B28] truncate">
                    {server.name}
                  </span>
                  <Badge className="bg-[#EDEAE3] text-[#8A8580] text-[10px] px-1.5 py-0.5">
                    {server.transport}
                  </Badge>
                  {server.tool_count > 0 && (
                    <Badge className="bg-[#E8F5E9] text-[#2E7D32] text-[10px] px-1.5 py-0.5">
                      {server.tool_count} tools
                    </Badge>
                  )}
                  {!server.enabled && (
                    <Badge className="bg-[#FFF3E0] text-[#E65100] text-[10px] px-1.5 py-0.5">
                      Disabled
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-[#B1ADA1] mt-0.5 truncate">
                  {server.transport === "stdio"
                    ? `${server.command || ""} ${(server.args || []).join(" ")}`
                    : server.url || ""}
                </div>
                {server.error_message && (
                  <div className="text-[10px] text-[#C62828] mt-0.5">
                    {server.error_message}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {server.status === "connected" ? (
                  <button
                    onClick={() => handleDisconnect(server.id)}
                    className="px-2 py-1 rounded text-[10px] border border-[#E5E1DB] text-[#6F6B66] hover:text-[#C62828] hover:border-[#FFCDD2] transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(server.id)}
                    disabled={server.status === "connecting" || !server.enabled}
                    className="px-2 py-1 rounded text-[10px] border border-[#E5E1DB] text-[#6F6B66] hover:text-[#2E7D32] hover:border-[#C8E6C9] transition-colors disabled:opacity-40"
                  >
                    {server.status === "connecting"
                      ? "Connecting..."
                      : "Connect"}
                  </button>
                )}
                <button
                  onClick={() => handleToggle(server.id, server.enabled)}
                  className="px-2 py-1 rounded text-[10px] border border-[#E5E1DB] text-[#6F6B66] hover:text-[#2D2B28] transition-colors"
                  title={server.enabled ? "Disable" : "Enable"}
                >
                  {server.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() =>
                    setExpandedId(
                      expandedId === server.id ? null : server.id,
                    )
                  }
                  className="px-2 py-1 rounded text-[10px] border border-[#E5E1DB] text-[#6F6B66] hover:text-[#2D2B28] transition-colors"
                >
                  {expandedId === server.id ? "Less" : "Details"}
                </button>
                <button
                  onClick={() => handleDelete(server.id)}
                  className="px-2 py-1 rounded text-[10px] border border-[#E5E1DB] text-[#6F6B66] hover:text-[#C62828] hover:border-[#FFCDD2] transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === server.id && (
              <div className="px-4 pb-3 border-t border-[#E5E1DB] pt-3 text-xs space-y-2">
                <div>
                  <span className="text-[#8A8580]">Transport:</span>{" "}
                  <span className="text-[#2D2B28]">{server.transport}</span>
                </div>
                {server.command && (
                  <div>
                    <span className="text-[#8A8580]">Command:</span>{" "}
                    <code className="text-[#C15F3C] bg-[#F4F3EE] px-1 rounded">
                      {server.command} {(server.args || []).join(" ")}
                    </code>
                  </div>
                )}
                {server.url && (
                  <div>
                    <span className="text-[#8A8580]">URL:</span>{" "}
                    <code className="text-[#C15F3C] bg-[#F4F3EE] px-1 rounded">
                      {server.url}
                    </code>
                  </div>
                )}
                {server.env && Object.keys(server.env).length > 0 && (
                  <div>
                    <span className="text-[#8A8580]">
                      Environment Variables:
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(server.env).map(([k, v]) => (
                        <div key={k} className="font-mono text-[10px]">
                          <span className="text-[#5E35B1]">{k}</span>=
                          <span className="text-[#8A8580]">
                            {v.length > 20
                              ? v.slice(0, 8) + "..." + v.slice(-4)
                              : v}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-[#8A8580]">Status:</span>{" "}
                  <span className="text-[#2D2B28]">{server.status}</span>
                  {server.tool_count > 0 && (
                    <span className="text-[#8A8580]">
                      {" "}
                      ({server.tool_count} tools available)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
