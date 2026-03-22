import { useState } from "react";
import { useWebHaptics } from "../lib/haptics";
import { auth as authApi } from "../lib/api";
import { setToken } from "../lib/auth";
import { router } from "../router";
import { branding } from "../theme.config";
import { Button, Input } from "../components/ui";

export function LoginPage() {
  const { trigger } = useWebHaptics();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  async function handleGuestLogin() {
    setError("");
    setGuestLoading(true);
    try {
      const res = await authApi.guestLogin();
      setToken(res.access_token);
      trigger("success");
      router.navigate({ to: "/chat" });
    } catch (err) {
      trigger("error");
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (isSignup) {
        const signup = await authApi.signup({
          email,
          password,
          name: name || undefined,
          bootstrap_token: bootstrapToken || undefined,
        });

        if (signup.status !== "active") {
          trigger("success");
          setIsSignup(false);
          setBootstrapToken("");
          setPassword("");
          setNotice("Account created. An admin must approve it before you can sign in.");
          return;
        }
      }

      const res = await authApi.login({ email, password });
      setToken(res.access_token);
      trigger("success");
      router.navigate({ to: "/chat" });
    } catch (err) {
      trigger("error");
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F3EE] p-4 pb-20 md:pb-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#2D2B28]">
            {branding.appName}
          </h1>
          <p className="text-[#B1ADA1] mt-2">{branding.tagline}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl p-6 space-y-4 border border-[#E5E1DB] shadow-sm"
        >
          <h2 className="text-lg font-semibold text-[#2D2B28]">
            {isSignup ? "Create Account" : "Sign In"}
          </h2>

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

          {isSignup && (
            <div>
              <label className="block text-sm text-[#6F6B66] mb-1">Name</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          {isSignup && (
            <div>
              <label className="block text-sm text-[#6F6B66] mb-1">
                Bootstrap Token
              </label>
              <Input
                type="password"
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
                placeholder="Required for the first admin only"
              />
              <p className="text-xs text-[#B1ADA1] mt-1">
                Needed only when creating the initial admin account.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#6F6B66] mb-1">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? "Loading..." : isSignup ? "Sign Up" : "Sign In"}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setError("");
              setNotice("");
              setBootstrapToken("");
            }}
            variant="ghost"
            className="w-full"
          >
            {isSignup
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </Button>
        </form>

        <div className="mt-4">
          <Button
            onClick={handleGuestLogin}
            disabled={guestLoading}
            variant="ghost"
            className="w-full border border-[#E5E1DB]"
          >
            {guestLoading ? "Loading..." : "👀 Look around without signing in"}
          </Button>
          <p className="text-center text-xs text-[#B1ADA1] mt-2">
            Explore with limited access • Free cloud models only
          </p>
        </div>

        <p className="text-center text-sm text-[#B1ADA1] mt-6">
          Want to create your own instance?{" "}
          <a
            href="https://github.com/Slaymish/GPUShare/blob/main/docs/SETUP.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C15F3C] hover:text-[#A84E30] underline"
          >
            See the setup guide
          </a>
        </p>
      </div>
    </div>
  );
}
