import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useWebHaptics } from "../lib/haptics";
import { auth as authApi } from "../lib/api";
import { branding } from "../theme.config";
import { Button, Input } from "../components/ui";

export function ResetPasswordPage() {
  const { trigger } = useWebHaptics();
  const search = useSearch({ from: "/reset-password" }) as { token?: string };
  const token = search.token;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("Missing reset token");
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.confirmPasswordReset(token, password);
      trigger("success");
      setNotice(res.message);
    } catch (err) {
      trigger("error");
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F3EE] p-4 pb-20 md:pb-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#2D2B28]">{branding.appName}</h1>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E5E1DB] shadow-sm text-center">
            <p className="text-[#C62828]">Invalid or missing reset link. Please request a new password reset.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F3EE] p-4 pb-20 md:pb-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#2D2B28]">{branding.appName}</h1>
          <p className="text-[#B1ADA1] mt-2">Set a new password</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl p-6 space-y-4 border border-[#E5E1DB] shadow-sm"
        >
          <h2 className="text-lg font-semibold text-[#2D2B28]">Reset Password</h2>

          {error && (
            <div className="bg-[#FFEBEE] border border-[#FFCDD2] text-[#C62828] text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          {notice && (
            <div className="bg-[#E8F5E9] border border-[#C8E6C9] text-[#2E7D32] text-sm rounded-lg p-3">
              {notice}
            </div>
          )}

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">New Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">Confirm Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" disabled={loading || !!notice} className="w-full" size="lg">
            {loading ? "Resetting..." : "Reset Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
