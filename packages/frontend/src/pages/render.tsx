import { useState, useEffect, useRef } from "react";
import { useWebHaptics } from "../lib/haptics";
import { render } from "../lib/api";
import type { RenderJobResponse } from "@shared/types/render";
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  RelativeTime,
} from "../components/ui";

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]",
  rendering: "bg-[#E3F2FD] text-[#1565C0] border-[#BBDEFB]",
  complete: "bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]",
  failed: "bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]",
};

type ViewMode = "list" | "grid";

function getInitialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem("gpushare_render_view");
    if (stored === "list" || stored === "grid") return stored;
  } catch {}
  return "list";
}

function ProgressBar({ job }: { job: RenderJobResponse }) {
  const totalFrames = job.frame_end - job.frame_start + 1;

  if (job.status === "rendering") {
    const pct = totalFrames > 0 ? (job.frames_done / totalFrames) * 100 : 0;
    return (
      <div className="mt-1.5 w-full bg-[#EDEBE6] rounded h-1.5 overflow-hidden">
        <div
          className="h-full rounded bg-[#C15F3C] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  if (job.status === "queued") {
    return (
      <div className="mt-1.5 w-full bg-[#EDEBE6] rounded h-1.5 overflow-hidden">
        <div
          className="h-full w-full rounded"
          style={{
            background:
              "linear-gradient(90deg, #EDEBE6 0%, #C15F3C 50%, #EDEBE6 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  return null;
}

const CubeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-10 h-10 text-[#B1ADA1]"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export function RenderPage() {
  const { trigger } = useWebHaptics();
  const [jobs, setJobs] = useState<RenderJobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [engine, setEngine] = useState<string>("cycles");
  const [frameStart, setFrameStart] = useState("1");
  const [frameEnd, setFrameEnd] = useState("1");
  const [resX, setResX] = useState("1920");
  const [resY, setResY] = useState("1080");
  const [outputFormat, setOutputFormat] = useState<string>("PNG");

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  function setAndPersistViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem("gpushare_render_view", mode);
    } catch {}
  }

  function fetchJobs() {
    render
      .listJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "queued" || j.status === "rendering",
    );
    if (!hasActive) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setSubmitting(true);
    setError("");
    try {
      const params = {
        engine,
        frame_start: Number(frameStart),
        frame_end: Number(frameEnd),
        resolution_x: Number(resX),
        resolution_y: Number(resY),
        output_format: outputFormat,
      };
      await render.createJob(file, params as any);
      trigger("success");
      fetchJobs();
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel(id: string) {
    trigger("buzz");
    render
      .cancelJob(id)
      .then(fetchJobs)
      .catch(() => {});
  }

  const totalFrames = (j: RenderJobResponse) => j.frame_end - j.frame_start + 1;

  const completedJobs = jobs.filter((j) => j.status === "complete");
  const nonCompletedJobs = jobs.filter((j) => j.status !== "complete");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl pb-20 md:pb-0 w-full">
      {/* Shimmer animation for queued progress bars */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <h2 className="text-lg font-semibold">Render Jobs</h2>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-4 md:p-6 space-y-4 border border-[#E5E1DB]"
      >
        <h3 className="font-medium">New Render Job</h3>

        {error && (
          <div className="bg-[#FFEBEE] border border-[#FFCDD2] text-[#C62828] text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="col-span-2 md:col-span-3">
            <label className="block text-sm text-[#6F6B66] mb-1">
              Blend File
            </label>
            <Input
              ref={fileRef}
              type="file"
              accept=".blend"
              required
              className="w-full text-sm text-[#6F6B66] file:mr-4 file:rounded-lg file:border-0 file:bg-[#EDEAE3] file:px-4 file:py-2 file:text-sm file:text-[#2D2B28] hover:file:bg-[#E5E1DB]"
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">Engine</label>
            <Select
              value={engine}
              onValueChange={(value) => setEngine(value as any)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cycles">Cycles</SelectItem>
                <SelectItem value="eevee">Eevee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">
              Frame Start
            </label>
            <Input
              type="number"
              value={frameStart}
              onChange={(e) => setFrameStart(e.target.value)}
              min={1}
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">
              Frame End
            </label>
            <Input
              type="number"
              value={frameEnd}
              onChange={(e) => setFrameEnd(e.target.value)}
              min={1}
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">
              Resolution X
            </label>
            <Input
              type="number"
              value={resX}
              onChange={(e) => setResX(e.target.value)}
              min={1}
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">
              Resolution Y
            </label>
            <Input
              type="number"
              value={resY}
              onChange={(e) => setResY(e.target.value)}
              min={1}
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">
              Output Format
            </label>
            <Select
              value={outputFormat}
              onValueChange={(value) => setOutputFormat(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PNG">PNG</SelectItem>
                <SelectItem value="JPEG">JPEG</SelectItem>
                <SelectItem value="OPEN_EXR">EXR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Job"}
        </Button>
      </form>

      <div className="bg-white rounded-xl overflow-hidden border border-[#E5E1DB]">
        {/* Header with view toggle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E1DB]">
          <h3 className="font-medium text-sm text-[#2D2B28]">Job History</h3>
          <div className="flex items-center gap-1 bg-[#EDEAE3] rounded-lg p-0.5">
            <button
              onClick={() => setAndPersistViewMode("list")}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-white text-[#2D2B28] shadow-sm"
                  : "text-[#6F6B66] hover:text-[#2D2B28]"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setAndPersistViewMode("grid")}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-white text-[#2D2B28] shadow-sm"
                  : "text-[#6F6B66] hover:text-[#2D2B28]"
              }`}
            >
              Grid
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-[#B1ADA1]">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-center text-[#B1ADA1]">
            No render jobs yet
          </div>
        ) : viewMode === "list" ? (
          /* ===== LIST VIEW ===== */
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[#E5E1DB] text-[#6F6B66] text-left">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Engine</th>
                  <th className="px-4 py-3 font-medium">Frames</th>
                  <th className="px-4 py-3 font-medium">Resolution</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[#EDEBE6]">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] || ""}`}
                      >
                        {job.status}
                        {job.status === "rendering" &&
                          ` (${job.frames_done}/${totalFrames(job)})`}
                      </span>
                      <ProgressBar job={job} />
                    </td>
                    <td className="px-4 py-3 capitalize">{job.engine}</td>
                    <td className="px-4 py-3">
                      {job.frame_start}-{job.frame_end}
                    </td>
                    <td className="px-4 py-3">
                      {job.resolution_x}x{job.resolution_y}
                    </td>
                    <td className="px-4 py-3">
                      {job.cost_nzd !== null
                        ? `$${job.cost_nzd.toFixed(4)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-[#6F6B66]">
                      <RelativeTime date={job.created_at} />
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      {job.download_url && (
                        <a
                          href={job.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#C15F3C] hover:text-[#A84E30] text-xs"
                        >
                          Download
                        </a>
                      )}
                      {(job.status === "queued" ||
                        job.status === "rendering") && (
                        <Button
                          onClick={() => handleCancel(job.id)}
                          variant="ghost"
                          size="sm"
                          className="text-[#C62828] hover:text-[#B71C1C] text-xs h-auto py-1"
                        >
                          Cancel
                        </Button>
                      )}
                      {job.error_message && (
                        <span
                          className="text-[#C62828] text-xs"
                          title={job.error_message}
                        >
                          Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ===== GRID VIEW ===== */
          <div className="p-4 space-y-4">
            {/* Non-completed jobs as a compact list */}
            {nonCompletedJobs.length > 0 && (
              <div className="space-y-2">
                {nonCompletedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#E5E1DB] px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] || ""}`}
                      >
                        {job.status}
                        {job.status === "rendering" &&
                          ` (${job.frames_done}/${totalFrames(job)})`}
                      </span>
                      <span className="text-[#6F6B66] capitalize truncate">
                        {job.engine} &middot; {job.frame_start}-{job.frame_end} &middot;{" "}
                        {job.resolution_x}x{job.resolution_y}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[#6F6B66] text-xs">
                        <RelativeTime date={job.created_at} />
                      </span>
                      {(job.status === "queued" ||
                        job.status === "rendering") && (
                        <Button
                          onClick={() => handleCancel(job.id)}
                          variant="ghost"
                          size="sm"
                          className="text-[#C62828] hover:text-[#B71C1C] text-xs h-auto py-1"
                        >
                          Cancel
                        </Button>
                      )}
                      {job.error_message && (
                        <span
                          className="text-[#C62828] text-xs"
                          title={job.error_message}
                        >
                          Error
                        </span>
                      )}
                    </div>
                    <ProgressBar job={job} />
                  </div>
                ))}
              </div>
            )}

            {/* Completed jobs as cards */}
            {completedJobs.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {completedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-[#E5E1DB] bg-[#FAFAF8] p-4 flex flex-col items-center gap-3 text-center"
                  >
                    <CubeIcon />
                    <div className="space-y-1 w-full">
                      <p className="text-sm font-medium capitalize">
                        {job.engine}
                      </p>
                      <p className="text-xs text-[#6F6B66]">
                        {job.resolution_x}x{job.resolution_y} &middot; Frames{" "}
                        {job.frame_start}-{job.frame_end}
                      </p>
                      <p className="text-xs text-[#6F6B66]">
                        <RelativeTime date={job.created_at} />
                      </p>
                      {job.cost_nzd !== null && (
                        <p className="text-xs text-[#6F6B66]">
                          ${job.cost_nzd.toFixed(4)}
                        </p>
                      )}
                    </div>
                    {job.download_url && (
                      <a
                        href={job.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg bg-[#C15F3C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A84E30] transition-colors w-full"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {completedJobs.length === 0 && nonCompletedJobs.length === 0 && (
              <div className="p-6 text-center text-[#B1ADA1]">
                No render jobs yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
