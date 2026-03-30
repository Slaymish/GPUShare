import { useEffect, useState } from "react";
import { auth } from "../lib/api";
import { Button, Input } from "../components/ui";

const HEARTBEAT_OPTIONS = [
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Once a day (9am)", value: "0 9 * * *" },
];

export function CodingAgentPage() {
  const [directories, setDirectories] = useState<string[]>([]);
  const [heartbeat, setHeartbeat] = useState("0 * * * *");
  const [newDir, setNewDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auth
      .getMe()
      .then((u) => {
        setDirectories(u.coding_agent_directories ?? []);
        setHeartbeat(u.coding_agent_heartbeat ?? "0 * * * *");
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function addDirectory(e: React.FormEvent) {
    e.preventDefault();
    const dir = newDir.trim();
    if (!dir || directories.includes(dir)) return;
    setDirectories((prev) => [...prev, dir]);
    setNewDir("");
  }

  function removeDirectory(dir: string) {
    setDirectories((prev) => prev.filter((d) => d !== dir));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await auth.updateMe({
        coding_agent_directories: directories,
        coding_agent_heartbeat: heartbeat,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2D2B28]">Coding Agent</h1>
          <p className="text-sm text-[#6F6B66] mt-1">
            Configure which repos the agent monitors and how often it checks for new issues.
          </p>
        </div>
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-[#E8F5E9] text-[#2E7D32]">
          Free
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[#FFEBEE] text-[#C62828] text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-[#E5E1DB] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Directories / Repos */}
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-[#2D2B28]">
                Repositories to monitor
              </h2>
              <p className="text-xs text-[#6F6B66] mt-0.5">
                Local paths or GitHub repo URLs the agent will watch for new issues and PRs.
              </p>
            </div>

            <form onSubmit={addDirectory} className="flex gap-2">
              <Input
                placeholder="/home/you/project  or  github.com/user/repo"
                value={newDir}
                onChange={(e) => setNewDir(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button type="submit" disabled={!newDir.trim()}>
                Add
              </Button>
            </form>

            {directories.length === 0 ? (
              <p className="text-sm text-[#6F6B66] text-center py-6 border border-dashed border-[#E5E1DB] rounded-lg">
                No repositories added yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {directories.map((dir) => (
                  <li
                    key={dir}
                    className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#E5E1DB]"
                  >
                    <span className="text-sm font-mono text-[#2D2B28] truncate">
                      {dir}
                    </span>
                    <button
                      onClick={() => removeDirectory(dir)}
                      className="ml-3 flex-shrink-0 text-[#B1ADA1] hover:text-[#C62828] transition-colors text-lg leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Heartbeat */}
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-[#2D2B28]">
                Heartbeat schedule
              </h2>
              <p className="text-xs text-[#6F6B66] mt-0.5">
                How often the agent polls your repos for new issues and PRs to work on.
              </p>
            </div>

            <div className="grid gap-2">
              {HEARTBEAT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    heartbeat === opt.value
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                      : "border-[#E5E1DB] bg-white hover:bg-[#F4F3EE]"
                  }`}
                >
                  <input
                    type="radio"
                    name="heartbeat"
                    value={opt.value}
                    checked={heartbeat === opt.value}
                    onChange={() => setHeartbeat(opt.value)}
                    className="accent-[var(--color-primary)]"
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-sm text-[#2D2B28]">{opt.label}</span>
                    <span className="text-xs font-mono text-[#B1ADA1]">{opt.value}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
            {saved && (
              <span className="text-sm text-[#2E7D32]">Saved</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
