import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Message } from "@/components/ui/message";
import { Page } from "@/components/ui/page";

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
    <Page className="pt-[calc(3rem+env(safe-area-inset-top))] text-center">
      <div className="text-5xl">🪙</div>
      <h1>Choose a new password</h1>
      <Message>Pick something you'll remember (at least 6 characters).</Message>

      <Card asChild className="mt-2 flex flex-col gap-3 text-left">
        <form onSubmit={submit}>
          <Field label="New password" className="text-[0.9rem] text-foreground">
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm password" className="text-[0.9rem] text-foreground">
            <Input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {error && <Message kind="error" className="mt-0">{error}</Message>}
          <Button disabled={busy}>{busy ? "Please wait..." : "Save password"}</Button>
          <Button type="button" variant="link" onClick={() => supabase.auth.signOut()}>
            Cancel
          </Button>
        </form>
      </Card>
    </Page>
  );
}
