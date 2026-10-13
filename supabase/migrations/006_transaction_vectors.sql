-- Vector search over the user's own PAST transactions, so a new transaction can be categorised
-- the way similar ones were before ("Swiggy" -> whatever Swiggy was filed under last time).
--
-- What gets embedded is the party name (shop / person), e.g. "Swiggy" or "Akhil". The
-- `categorize` Edge Function fills `embedding` in (gte-small can't run inside Postgres).
-- NULL means "not embedded yet".

create extension if not exists vector with schema extensions;

-- 384 dimensions = Supabase's built-in `gte-small` embedding model (same as categories.embedding).
alter table public.transactions
  add column if not exists embedding extensions.vector(384);

create index if not exists transactions_embedding_idx
  on public.transactions using hnsw (embedding extensions.vector_cosine_ops);

-- If the party name ever changes, the old embedding is wrong: clear it so it is re-embedded.
create or replace function public.transactions_clear_embedding_on_party_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.transactions set embedding = null where id = new.transaction_id;
  end if;
  return new;
end;
$$;

drop trigger if exists transaction_parties_clear_embedding on public.transaction_parties;
create trigger transaction_parties_clear_embedding
  after update of name on public.transaction_parties
  for each row execute function public.transactions_clear_embedding_on_party_change();

-- Transactions that still need an embedding (have a party, no vector yet).
-- SECURITY INVOKER: row-level security limits it to the caller's own rows.
create or replace function public.transactions_to_embed(p_limit int default 100)
returns table (id uuid, party text)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, p.name as party
  from public.transactions t
  join public.transaction_parties p on p.transaction_id = t.id
  where t.embedding is null
  order by t.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- The caller's past, categorised transactions that are closest to a query embedding.
-- Optionally restricted to one type (debit/credit), so "salary" credits don't vote on debits.
-- Returns the PRIMARY category of each neighbour, plus its party name as a worked example.
create or replace function public.match_transactions(
  query_embedding extensions.vector(384),
  p_type text default null,
  match_count int default 15
)
returns table (transaction_id uuid, category_id uuid, category_name text, party text, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with nearest as (
    select t.id, t.category_id, (1 - (t.embedding <=> query_embedding))::float as similarity
    from public.transactions t
    where t.embedding is not null
      and t.category_id is not null
      and (p_type is null or t.type = p_type)
    order by t.embedding <=> query_embedding
    limit least(greatest(match_count, 1), 50)
  )
  select n.id, n.category_id, c.name, p.name, n.similarity
  from nearest n
  join public.categories c on c.id = n.category_id
  left join public.transaction_parties p on p.transaction_id = n.id
  order by n.similarity desc;
$$;

revoke execute on function public.transactions_to_embed(int) from public, anon;
grant execute on function public.transactions_to_embed(int) to authenticated;
revoke execute on function public.match_transactions(extensions.vector, text, int) from public, anon;
grant execute on function public.match_transactions(extensions.vector, text, int) to authenticated;

notify pgrst, 'reload schema';
