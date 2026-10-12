-- Transactions. One row in `transactions` is the "header"; the date, the amount and the
-- person/shop each live in their own table, all keyed by the SAME transaction_id.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('debit', 'credit')),   -- debit = money out, credit = money in
  category_id uuid references public.categories(id) on delete set null,
  raw_text text,                                             -- what the user typed / said
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_dates (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  txn_date date not null
);

create table if not exists public.transaction_amounts (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'INR'
);

create table if not exists public.transaction_parties (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(trim(name)) between 1 and 60)
);

create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index if not exists transactions_category_idx on public.transactions (category_id);
create index if not exists transaction_dates_user_date_idx on public.transaction_dates (user_id, txn_date desc);
create index if not exists transaction_parties_user_name_idx on public.transaction_parties (user_id, lower(name));

-- Row-level security: everybody only ever sees their own rows.
alter table public.transactions enable row level security;
alter table public.transaction_dates enable row level security;
alter table public.transaction_amounts enable row level security;
alter table public.transaction_parties enable row level security;

do $$
declare t text;
begin
  foreach t in array array['transactions', 'transaction_dates', 'transaction_amounts', 'transaction_parties']
  loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own rows insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own rows update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own rows delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Saves a whole transaction atomically: (optionally creates the category), the header row,
-- and the date / amount / party rows, all with the same transaction id. Returns that id.
-- SECURITY INVOKER, so row-level security applies exactly as for direct inserts.
create or replace function public.add_transaction(
  p_type text,
  p_date date,
  p_amount numeric,
  p_party text default null,
  p_category_id uuid default null,
  p_new_category text default null,
  p_raw_text text default null,
  p_currency text default 'INR'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_category uuid := p_category_id;
  v_name text;
  v_tid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Reuse an existing category with the same name, otherwise create it.
  if v_category is null and nullif(trim(coalesce(p_new_category, '')), '') is not null then
    v_name := left(trim(p_new_category), 40);
    v_name := upper(left(v_name, 1)) || substr(v_name, 2);
    select id into v_category from public.categories
      where user_id = auth.uid() and lower(name) = lower(v_name);
    if v_category is null then
      insert into public.categories (name) values (v_name) returning id into v_category;
    end if;
  end if;

  insert into public.transactions (type, category_id, raw_text)
    values (p_type, v_category, left(p_raw_text, 500))
    returning id into v_tid;

  insert into public.transaction_dates (transaction_id, txn_date) values (v_tid, p_date);
  insert into public.transaction_amounts (transaction_id, amount, currency)
    values (v_tid, p_amount, coalesce(nullif(trim(p_currency), ''), 'INR'));

  if nullif(trim(coalesce(p_party, '')), '') is not null then
    insert into public.transaction_parties (transaction_id, name) values (v_tid, left(trim(p_party), 60));
  end if;

  return v_tid;
end;
$$;

revoke execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text) from public, anon;
grant execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
