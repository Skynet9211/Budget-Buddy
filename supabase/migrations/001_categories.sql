-- Categories table: each row belongs to one signed-in user.
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

-- No duplicate names per user (case-insensitive).
create unique index if not exists categories_user_name_uniq
  on public.categories (user_id, lower(name));

alter table public.categories enable row level security;

create policy "Users read own categories" on public.categories
  for select using (auth.uid() = user_id);
create policy "Users insert own categories" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "Users update own categories" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own categories" on public.categories
  for delete using (auth.uid() = user_id);

-- Make the API pick up the new table right away.
notify pgrst, 'reload schema';
