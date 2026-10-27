-- Fix recursive RLS on family_members and families.
-- The old policies checked family_members/families from within the same tables,
-- which creates a circular policy dependency and PostgreSQL rejects it.

drop policy if exists "family members read" on public.family_members;
drop policy if exists "family members insert" on public.family_members;
drop policy if exists "family members update" on public.family_members;
drop policy if exists "family members delete" on public.family_members;

drop policy if exists "family owners or members read" on public.families;
drop policy if exists "family owners insert" on public.families;
drop policy if exists "family owners update" on public.families;
drop policy if exists "family owners delete" on public.families;

drop policy if exists "family invites read" on public.family_invitations;
drop policy if exists "family invites insert" on public.family_invitations;
drop policy if exists "family invites update" on public.family_invitations;
drop policy if exists "family invites delete" on public.family_invitations;

create or replace function public.user_is_family_owner(p_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.families f
    where f.id = p_family_id
      and f.owner_user_id = auth.uid()
  );
$$;

create or replace function public.user_is_family_member(p_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
  );
$$;

create policy "family owners or members read" on public.families
  for select using (
    owner_user_id = auth.uid()
    or public.user_is_family_member(id)
  );

create policy "family owners insert" on public.families
  for insert with check (owner_user_id = auth.uid());

create policy "family owners update" on public.families
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "family owners delete" on public.families
  for delete using (owner_user_id = auth.uid());

create policy "family members read" on public.family_members
  for select using (
    user_id = auth.uid()
    or public.user_is_family_owner(family_id)
  );

create policy "family members insert" on public.family_members
  for insert with check (
    user_id = auth.uid()
    or public.user_is_family_owner(family_id)
  );

create policy "family members update" on public.family_members
  for update using (
    user_id = auth.uid()
    or public.user_is_family_owner(family_id)
  ) with check (
    user_id = auth.uid()
    or public.user_is_family_owner(family_id)
  );

create policy "family members delete" on public.family_members
  for delete using (
    user_id = auth.uid()
    or public.user_is_family_owner(family_id)
  );

create policy "family invites read" on public.family_invitations
  for select using (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    or public.user_is_family_owner(family_id)
  );

create policy "family invites insert" on public.family_invitations
  for insert with check (
    invited_by = auth.uid()
    or public.user_is_family_owner(family_id)
  );

create policy "family invites update" on public.family_invitations
  for update using (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    or public.user_is_family_owner(family_id)
  ) with check (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    or public.user_is_family_owner(family_id)
  );

create policy "family invites delete" on public.family_invitations
  for delete using (
    invited_by = auth.uid()
    or public.user_is_family_owner(family_id)
  );
