import { useState } from "react";
import type { Category } from "../hooks/useCategories";
import { useSearch } from "../hooks/useSearch";
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
  const { query, setQuery, filtered } = useSearch(categories, (c, q) => c.name.toLowerCase().includes(q));

  async function save(id: string) {
    const err = await onRename(id, draft);
    if (err) setError(err);
    else {
      setEditingId(null);
      setError(null);
    }
  }

  return (
    <section className="card">
      <h2>Your categories {filtered.length > 0 && <span className="count">{filtered.length}</span>}</h2>

      <div className="list-filter">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          aria-label="Search categories"
        />
      </div>

      {loading && <p className="hint">Loading...</p>}
      {!loading && filtered.length === 0 && (
        <p className="empty">{query ? "No matching categories found" : "No categories yet. Add your first one above ✨"}</p>
      )}
      {error && <p className="error">{error}</p>}
      <ul className="cat-list">
        {filtered.map((c) => (
          <li key={c.id} className="cat">
            <span className="emoji">{emojiFor(c.name)}</span>
            {editingId === c.id ? (
              <>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  aria-label="Rename category"
                />
                <button className="icon-btn" onClick={() => save(c.id)} aria-label="Save name">
                  ✓
                </button>
                <button className="icon-btn" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                  ✕
                </button>
              </>
            ) : (
              <>
                <span className="name">{c.name}</span>
                <button
                  className="icon-btn"
                  aria-label={`Rename ${c.name}`}
                  onClick={() => {
                    setEditingId(c.id);
                    setDraft(c.name);
                    setError(null);
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon-btn danger"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    if (confirm(`Delete "${c.name}"?`)) onDelete(c.id);
                  }}
                >
                  🗑
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
