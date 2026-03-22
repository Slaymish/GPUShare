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
} from "../components/ui";

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]",
  rendering: "bg-[#E3F2FD] text-[#1565C0] border-[#BBDEFB]",
  complete: "bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]",
  failed: "bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]",
};

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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl pb-20 md:pb-0 w-full">
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
        {loading ? (
          <div className="p-6 text-center text-[#B1ADA1]">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-center text-[#B1ADA1]">
            No render jobs yet
          </div>
        ) : (
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
                      {new Date(job.created_at).toLocaleDateString()}
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
        )}
      </div>
    </div>
  );
}
