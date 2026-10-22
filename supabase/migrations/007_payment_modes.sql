-- Mode of payment: how a transaction was paid (UPI, cash, card, ...).
--
-- `payment_modes` is a small shared lookup table. `transactions.payment_mode` points at it and
-- defaults to 'upi', so existing rows become UPI and a transaction saved without a mode (or with
-- one we don't know) is UPI as well.

create table if not exists public.payment_modes (
  id text primary key check (id = lower(id) and id ~ '^[a-z0-9_]+$'),   -- stable code, e.g. 'upi'
  name text not null,                                                   -- label shown in the app
  sort_order smallint not null default 0
);

insert into public.payment_modes (id, name, sort_order) values
  ('upi',        'UPI',         1),
  ('cash',       'Cash',        2),
  ('card',       'Card',        3),
  ('netbanking', 'Net Banking', 4),
  ('wallet',     'Wallet',      5),
  ('cheque',     'Cheque',      6)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

-- Everyone signed in can read the list; nobody can change it from the app.
alter table public.payment_modes enable row level security;
drop policy if exists "payment modes readable" on public.payment_modes;
create policy "payment modes readable" on public.payment_modes for select to authenticated using (true);
revoke all on public.payment_modes from anon;
revoke insert, update, delete on public.payment_modes from authenticated;
grant select on public.payment_modes to authenticated;

alter table public.transactions
  add column if not exists payment_mode text not null default 'upi' references public.payment_modes(id);

create index if not exists transactions_user_payment_mode_idx on public.transactions (user_id, payment_mode);

-- add_transaction gains a trailing p_payment_mode argument. Drop the old signature first, otherwise
-- both versions would exist and a call that omits the new argument would be ambiguous.
drop function if exists public.add_transaction(text, date, numeric, text, uuid, text, text, text);

-- An empty or unknown payment mode is saved as UPI.
create or replace function public.add_transaction(
  p_type text,
  p_date date,
  p_amount numeric,
  p_party text default null,
  p_category_id uuid default null,
  p_new_category text default null,
  p_raw_text text default null,
  p_currency text default 'INR',
  p_payment_mode text default 'upi'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_category uuid := p_category_id;
  v_name text;
  v_mode text := lower(trim(coalesce(p_payment_mode, '')));
  v_tid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (select 1 from public.payment_modes where id = v_mode) then
    v_mode := 'upi';
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

  insert into public.transactions (type, category_id, raw_text, payment_mode)
    values (p_type, v_category, left(p_raw_text, 500), v_mode)
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

revoke execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text, text) to authenticated;

-- Same as before, plus an optional "payment_mode" key on each item, e.g.
--   [{"type":"debit","date":"2026-09-13","amount":300,"party":"Blinkit","payment_mode":"cash", ...}]
create or replace function public.add_transactions(p_items jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to save';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many transactions at once (max 50)';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ids := v_ids || public.add_transaction(
      p_type         => v_item->>'type',
      p_date         => (v_item->>'date')::date,
      p_amount       => (v_item->>'amount')::numeric,
      p_party        => nullif(v_item->>'party', ''),
      p_category_id  => nullif(v_item->>'category_id', '')::uuid,
      p_new_category => nullif(v_item->>'new_category', ''),
      p_raw_text     => nullif(v_item->>'raw_text', ''),
      p_payment_mode => nullif(v_item->>'payment_mode', '')
    );
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.add_transactions(jsonb) from public, anon;
grant execute on function public.add_transactions(jsonb) to authenticated;

notify pgrst, 'reload schema';
