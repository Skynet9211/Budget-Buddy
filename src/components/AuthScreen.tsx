import { useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "signin" | "signup" | "forgot" | "code";

// Set only on the dev site (see .env.example). Shows a one-click login to the seeded demo account.
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "info" } | null>(null);

  function go(next: Mode, msg: typeof message = null) {
    setMode(next);
    setMessage(msg);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ text: error.message, kind: "error" });
    } else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage({ text: error.message, kind: "error" });
      else if (!data.session)
        setMessage({ text: "Account created. Check your email to confirm, then sign in.", kind: "info" });
    } else if (mode === "forgot") {
      // Emails a one-time code (see README for the email template change this needs).
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) setMessage({ text: error.message, kind: "error" });
      else go("code", { text: `We sent a code to ${email.trim()}. Enter it below.`, kind: "info" });
    } else {
      // On success Supabase signs the user in and fires PASSWORD_RECOVERY; the app then shows
      // the "set a new password" screen, so there's nothing more to do here.
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
      if (error) setMessage({ text: "That code is wrong or has expired. Check it or request a new one.", kind: "error" });
    }
    setBusy(false);
  }

  async function signInDemo() {
    if (!DEMO_EMAIL || !DEMO_PASSWORD) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (error) setMessage({ text: error.message, kind: "error" });
    setBusy(false);
  }

  const showPassword = mode === "signin" || mode === "signup";
  const subtitle =
    mode === "forgot"
      ? "Enter your email and we'll send you a code to reset your password."
      : mode === "code"
        ? "Enter the code from your email."
        : "Sort your spending into categories, by voice or typing.";
  const submitLabel = { signin: "Sign in", signup: "Create account", forgot: "Send code", code: "Verify code" }[mode];

  return (
    <main className="page auth">
      <div className="logo">🪙</div>
      <h1>Budget Buddy</h1>
      <p className="subtitle">{subtitle}</p>

      <form className="card form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            readOnly={mode === "code"}
          />
        </label>
        {showPassword && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>
        )}
        {mode === "code" && (
          <label>
            Code
            <input
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{6,8}"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
            />
          </label>
        )}
        {message && <p className={message.kind === "error" ? "error" : "info"}>{message.text}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Please wait..." : submitLabel}
        </button>

        {mode === "signin" && DEMO_EMAIL && DEMO_PASSWORD && (
          <button type="button" className="btn" disabled={busy} onClick={signInDemo}>
            Try the demo account
          </button>
        )}

        {mode === "signin" && (
          <button type="button" className="btn link" onClick={() => go("forgot")}>
            Forgot password?
          </button>
        )}
        {mode === "code" && (
          <button type="button" className="btn link" onClick={() => go("forgot")}>
            Didn't get it? Send a new code
          </button>
        )}
        <button
          type="button"
          className="btn link"
          onClick={() => go(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Have an account? Sign in" : "Back to sign in"}
        </button>
      </form>
    </main>
  );
}
