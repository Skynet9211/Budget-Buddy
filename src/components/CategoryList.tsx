import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { List, ListEmoji, ListItem } from "@/components/ui/list";
import { Message } from "@/components/ui/message";
import type { Category } from "../hooks/useCategories";
import { emojiFor } from "../lib/categories";

interface Props {
  categories: Category[];
  loading: boolean;
  onRename: (id: string, name: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
}

export default function CategoryList({ categories, loading, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function save(id: string) {
    const err = await onRename(id, draft);
    if (err) setError(err);
    else {
      setEditingId(null);
      setError(null);
    }
  }

  return (
    <Card>
      <h2>Your categories {categories.length > 0 && <Badge variant="secondary">{categories.length}</Badge>}</h2>
      {loading && <Message>Loading...</Message>}
      {!loading && categories.length === 0 && (
        <Message kind="empty">No categories yet. Add your first one above ✨</Message>
      )}
      {error && <Message kind="error">{error}</Message>}
      <List>
        {categories.map((c) => (
          <ListItem key={c.id}>
            <ListEmoji>{emojiFor(c.name)}</ListEmoji>
            {editingId === c.id ? (
              <>
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  aria-label="Rename category"
                />
                <Button variant="ghost" size="icon" onClick={() => save(c.id)} aria-label="Save name">
                  ✓
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                  ✕
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-bold wrap-anywhere">{c.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Rename ${c.name}`}
                  onClick={() => {
                    setEditingId(c.id);
                    setDraft(c.name);
                    setError(null);
                  }}
                >
                  ✎
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:text-destructive"
                  aria-label={`Delete ${c.name}`}
                  onClick={async () => {
                    if (await confirm({ title: `Delete "${c.name}"?` })) await onDelete(c.id);
                  }}
                >
                  🗑
                </Button>
              </>
            )}
          </ListItem>
        ))}
      </List>
      {confirmDialog}
    </Card>
  );
}
