import { useState } from "react";
import { supabase } from "../lib/supabase";

/** Shown after a valid reset code (or reset link) so the user can choose a new password. */
export default function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <main className="page auth">
      <div className="logo">🪙</div>
      <h1>Choose a new password</h1>
      <p className="subtitle">Pick something you'll remember (at least 6 characters).</p>

      <form className="card form" onSubmit={submit}>
        <label>
          New password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Please wait..." : "Save password"}
        </button>
        <button type="button" className="btn link" onClick={() => supabase.auth.signOut()}>
          Cancel
        </button>
      </form>
    </main>
  );
}
