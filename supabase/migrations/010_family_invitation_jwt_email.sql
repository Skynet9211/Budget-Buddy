-- Use the signed-in user's JWT email claim instead of granting clients access to auth.users.
drop policy if exists "family invites read" on public.family_invitations;

create policy "family invites read" on public.family_invitations
  for select using (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = public.family_invitations.family_id and fm.user_id = auth.uid() and fm.role = 'owner'
    )
  );

create or replace function public.accept_family_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invitation public.family_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '28000';
  end if;

  if v_email = '' then
    raise exception 'Your account does not have an email address.' using errcode = '22023';
  end if;

  select * into v_invitation
  from public.family_invitations
  where token = p_token and lower(email) = v_email and status in ('pending', 'accepted')
  for update;

  if not found then
    raise exception 'This invitation is invalid, already used, or belongs to a different email address.' using errcode = '22023';
  end if;

  if v_invitation.status = 'pending' then
    insert into public.family_members (family_id, user_id, role)
    values (v_invitation.family_id, v_user_id, 'member')
    on conflict (family_id, user_id) do nothing;

    update public.family_invitations
    set status = 'accepted', updated_at = now()
    where id = v_invitation.id;
  elsif not exists (
    select 1 from public.family_members
    where family_id = v_invitation.family_id and user_id = v_user_id
  ) then
    raise exception 'This invitation has already been used.' using errcode = '22023';
  end if;

  return v_invitation.family_id;
end;
$$;

revoke all on function public.accept_family_invitation(uuid) from public, anon;
grant execute on function public.accept_family_invitation(uuid) to authenticated;
