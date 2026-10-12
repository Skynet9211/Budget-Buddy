-- Vector search for categories (pgvector). Lets the AI shortlist the most relevant
-- categories for a transaction description instead of reading the whole list.

create extension if not exists vector with schema extensions;

-- 384 dimensions = Supabase's built-in `gte-small` embedding model.
-- NULL means "not embedded yet"; the `categorize` Edge Function fills it in.
alter table public.categories
  add column if not exists embedding extensions.vector(384);

-- Approximate nearest-neighbour index (cosine distance).
create index if not exists categories_embedding_idx
  on public.categories using hnsw (embedding extensions.vector_cosine_ops);

-- Renaming a category makes its old embedding wrong, so clear it; it is re-embedded on next sync.
create or replace function public.categories_clear_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    new.embedding := null;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_clear_embedding on public.categories;
create trigger categories_clear_embedding
  before update of name on public.categories
  for each row execute function public.categories_clear_embedding();

-- Nearest categories to a query embedding. SECURITY INVOKER (the default), so the
-- existing row-level-security policies apply and a user only ever matches their own categories.
create or replace function public.match_categories(
  query_embedding extensions.vector(384),
  match_count int default 5,
  min_similarity float default 0
)
returns table (id uuid, name text, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.name,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.categories c
  where c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke execute on function public.match_categories(extensions.vector, int, float) from public, anon;
grant execute on function public.match_categories(extensions.vector, int, float) to authenticated;

notify pgrst, 'reload schema';
