-- Family membership and sharing support.
-- Adds a shared family layer while keeping personal ownership (`user_id`) intact.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, lower(email))
);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;

-- Family rows: owners can read/manage their own families; members can read the family they belong to.
drop policy if exists "family owners or members read" on public.families;
drop policy if exists "family owners insert" on public.families;
drop policy if exists "family owners update" on public.families;
drop policy if exists "family owners delete" on public.families;

create policy "family owners or members read" on public.families
  for select using (
    owner_user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.families.id and fm.user_id = auth.uid()
    )
  );

create policy "family owners insert" on public.families
  for insert with check (owner_user_id = auth.uid());

create policy "family owners update" on public.families
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "family owners delete" on public.families
  for delete using (owner_user_id = auth.uid());

-- Membership rows: members can read the membership list for their family; only the user or owner can add or update.
drop policy if exists "family members read" on public.family_members;
drop policy if exists "family members insert" on public.family_members;
drop policy if exists "family members update" on public.family_members;
drop policy if exists "family members delete" on public.family_members;

create policy "family members read" on public.family_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_members.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

create policy "family members insert" on public.family_members
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_members.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

create policy "family members update" on public.family_members
  for update using (
    user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_members.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  ) with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_members.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

create policy "family members delete" on public.family_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_members.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

-- Invites: the inviter and current family owner can read the family invites; invitees can read their own pending invites.
drop policy if exists "family invites read" on public.family_invitations;
drop policy if exists "family invites insert" on public.family_invitations;
drop policy if exists "family invites update" on public.family_invitations;
drop policy if exists "family invites delete" on public.family_invitations;

create policy "family invites read" on public.family_invitations
  for select using (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_invitations.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

create policy "family invites insert" on public.family_invitations
  for insert with check (
    invited_by = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_invitations.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

create policy "family invites update" on public.family_invitations
  for update using (
    invited_by = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_invitations.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
  ) with check (
    invited_by = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_invitations.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
  );

create policy "family invites delete" on public.family_invitations
  for delete using (
    invited_by = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_invitations.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

-- Add a family context to categories and transactions so they can be shared with a family.
alter table public.categories add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.transactions add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.transactions add column if not exists share_with_family boolean not null default false;
alter table public.transactions add column if not exists family_member_name text check (char_length(trim(family_member_name)) between 1 and 60);
alter table public.transaction_dates add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.transaction_amounts add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.transaction_parties add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.transaction_categories add column if not exists family_id uuid references public.families(id) on delete cascade;

create index if not exists categories_family_idx on public.categories (family_id, created_at desc);
create index if not exists transactions_family_idx on public.transactions (family_id, created_at desc);
create index if not exists transaction_dates_family_idx on public.transaction_dates (family_id, txn_date desc);
create index if not exists transaction_amounts_family_idx on public.transaction_amounts (family_id);
create index if not exists transaction_parties_family_idx on public.transaction_parties (family_id, lower(name));
create index if not exists family_invitations_status_idx on public.family_invitations (status, lower(email));

-- Keep existing personal rows valid; family-specific rows are optional and can be filtered by `family_id`.

-- Updates the store functions so new transactions can optionally be attached to a family.
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
  p_family_member_name text default null
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

  if p_family_id is not null then
    if not exists (
      select 1 from public.family_members fm
      where fm.family_id = p_family_id and fm.user_id = auth.uid()
    ) then
      raise exception 'You are not a member of that family';
    end if;
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

  insert into public.transactions (type, category_id, raw_text, family_id, share_with_family, family_member_name)
    values (p_type, v_category, left(p_raw_text, 500), p_family_id, coalesce(p_share_with_family, false), nullif(trim(coalesce(p_family_member_name, '')), ''))
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

revoke execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text, uuid, boolean, text) from public, anon;
grant execute on function public.add_transaction(text, date, numeric, text, uuid, text, text, text, uuid, boolean, text) to authenticated;

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
      p_type              => v_item->>'type',
      p_date              => (v_item->>'date')::date,
      p_amount            => (v_item->>'amount')::numeric,
      p_party             => nullif(v_item->>'party', ''),
      p_category_id       => nullif(v_item->>'category_id', '')::uuid,
      p_new_category      => nullif(v_item->>'new_category', ''),
      p_raw_text          => nullif(v_item->>'raw_text', ''),
      p_currency          => coalesce(nullif(v_item->>'currency', ''), 'INR'),
      p_family_id         => nullif(v_item->>'family_id', '')::uuid,
      p_share_with_family => (v_item->>'share_with_family')::boolean,
      p_family_member_name => nullif(v_item->>'family_member_name', '')
    );
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.add_transactions(jsonb) from public, anon;
grant execute on function public.add_transactions(jsonb) to authenticated;

notify pgrst, 'reload schema';
