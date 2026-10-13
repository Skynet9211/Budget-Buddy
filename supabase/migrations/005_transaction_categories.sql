-- Lets one transaction belong to MANY categories (e.g. "Movie night" -> Entertainment + Food).
--
-- `transactions.category_id` stays as the "primary" category so existing code keeps working.
-- The full set of categories lives in `transaction_categories` (many-to-many).

create table if not exists public.transaction_categories (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  primary key (transaction_id, category_id)
);

create index if not exists transaction_categories_category_idx on public.transaction_categories (category_id);
create index if not exists transaction_categories_user_idx on public.transaction_categories (user_id);

alter table public.transaction_categories enable row level security;

drop policy if exists "own rows select" on public.transaction_categories;
drop policy if exists "own rows insert" on public.transaction_categories;
drop policy if exists "own rows delete" on public.transaction_categories;
create policy "own rows select" on public.transaction_categories for select using (auth.uid() = user_id);
create policy "own rows insert" on public.transaction_categories for insert with check (auth.uid() = user_id);
create policy "own rows delete" on public.transaction_categories for delete using (auth.uid() = user_id);

-- Backfill: every existing transaction keeps the single category it already had.
insert into public.transaction_categories (transaction_id, category_id, user_id)
select id, category_id, user_id from public.transactions where category_id is not null
on conflict do nothing;

-- Keep the join table in step with the primary category, so transactions saved by the existing
-- add_transaction(s) functions automatically get their category row.
create or replace function public.sync_primary_category()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.category_id is not null then
    insert into public.transaction_categories (transaction_id, category_id, user_id)
    values (new.id, new.category_id, new.user_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_sync_primary_category on public.transactions;
create trigger transactions_sync_primary_category
  after insert or update of category_id on public.transactions
  for each row execute function public.sync_primary_category();

-- Adds categories to a transaction, keeping the ones it already has.
-- SECURITY INVOKER: row-level security decides what the caller may see and change.
create or replace function public.add_transaction_categories(
  p_transaction_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select coalesce(array_agg(distinct id), '{}') into v_ids from unnest(coalesce(p_category_ids, '{}')) as t(id);

  if not exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'Transaction not found';
  end if;
  if (select count(*) from public.categories where id = any (v_ids)) <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Unknown category';
  end if;

  insert into public.transaction_categories (transaction_id, category_id)
    select p_transaction_id, unnest(v_ids)
  on conflict do nothing;
end;
$$;

revoke execute on function public.add_transaction_categories(uuid, uuid[]) from public, anon;
grant execute on function public.add_transaction_categories(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
