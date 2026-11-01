-- 008 redefined add_transactions without the payment_mode key from 007, so every saved transaction
-- fell back to the column default (UPI). This brings back one add_transaction that takes both the
-- family arguments and the payment mode, and makes add_transactions pass the mode through.

-- Drop both existing overloads (007's with payment mode, 008's with family) so only one remains.
drop function if exists public.add_transaction(text, date, numeric, text, uuid, text, text, text, text);
drop function if exists public.add_transaction(text, date, numeric, text, uuid, text, text, text, uuid, boolean, text);

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
  p_family_id uuid default null,
  p_share_with_family boolean default false,
  p_family_member_name text default null,
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

  if p_family_id is not null then
    if not exists (
      select 1 from public.family_members fm
      where fm.family_id = p_family_id and fm.user_id = auth.uid()
    ) then
      raise exception 'You are not a member of that family';
    end if;
  end if;

  if not exists (select 1 from public.payment_modes where id = v_mode) then
    v_mode := 'upi';
  end if;

  if v_category is null and nullif(trim(coalesce(p_new_category, '')), '') is not null then
    v_name := left(trim(p_new_category), 40);
    v_name := upper(left(v_name, 1)) || substr(v_name, 2);
    select id into v_category from public.categories
      where user_id = auth.uid() and family_id is not distinct from p_family_id and lower(name) = lower(v_name);
    if v_category is null then
      insert into public.categories (name, family_id, user_id)
      values (v_name, p_family_id, auth.uid()) returning id into v_category;
    end if;
  end if;

  insert into public.transactions (type, category_id, raw_text, family_id, share_with_family, family_member_name, payment_mode)
    values (p_type, v_category, left(p_raw_text, 500), p_family_id, coalesce(p_share_with_family, false), nullif(trim(coalesce(p_family_member_name, '')), ''), v_mode)
    returning id into v_tid;

  insert into public.transaction_dates (transaction_id, txn_date, family_id)
    values (v_tid, p_date, p_family_id);

  insert into public.transaction_amounts (transaction_id, amount, currency, family_id)
    values (v_tid, p_amount, coalesce(nullif(trim(p_currency), ''), 'INR'), p_family_id);

  if nullif(trim(coalesce(p_party, '')), '') is not null then
    insert into public.transaction_parties (transaction_id, name, family_id)
      values (v_tid, left(trim(p_party), 60), p_family_id);
  end if;

  if v_category is not null then
    insert into public.transaction_categories (transaction_id, category_id, user_id, family_id)
    values (v_tid, v_category, auth.uid(), p_family_id)
    on conflict do nothing;
  end if;

  return v_tid;
end;
$$;

revoke execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text, uuid, boolean, text, text) from public, anon;
grant execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text, uuid, boolean, text, text) to authenticated;

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
      p_type               => v_item->>'type',
      p_date               => (v_item->>'date')::date,
      p_amount             => (v_item->>'amount')::numeric,
      p_party              => nullif(v_item->>'party', ''),
      p_category_id        => nullif(v_item->>'category_id', '')::uuid,
      p_new_category       => nullif(v_item->>'new_category', ''),
      p_raw_text           => nullif(v_item->>'raw_text', ''),
      p_currency           => coalesce(nullif(v_item->>'currency', ''), 'INR'),
      p_family_id          => nullif(v_item->>'family_id', '')::uuid,
      p_share_with_family  => (v_item->>'share_with_family')::boolean,
      p_family_member_name => nullif(v_item->>'family_member_name', ''),
      p_payment_mode       => nullif(v_item->>'payment_mode', '')
    );
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.add_transactions(jsonb) from public, anon;
grant execute on function public.add_transactions(jsonb) to authenticated;

notify pgrst, 'reload schema';
