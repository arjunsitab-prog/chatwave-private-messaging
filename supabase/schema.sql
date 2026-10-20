-- ChatWave database schema for Supabase.
-- Run in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_color text not null default '#7565ef',
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id, conversation_id);

-- Create profile automatically after a new auth user is created.
-- Username defaults to the email prefix plus a short suffix; user can later edit it.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  base_name text;
  safe_name text;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'user'), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base_name) < 3 then base_name := 'user'; end if;
  safe_name := left(base_name, 15) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  insert into public.profiles (id, username, display_name)
  values (new.id, safe_name, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email, '@', 1), 'User'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_chatwave on auth.users;
create trigger on_auth_user_created_chatwave
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Security-definer helper avoids recursive RLS evaluation on conversation_members.
create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Profiles are visible to signed-in users so they can find usernames to message.
create policy "Signed-in users can view profiles"
on public.profiles for select to authenticated using (true);
create policy "Users can update their own profile"
on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Members can view their conversations"
on public.conversations for select to authenticated
using (public.is_conversation_member(id));

create policy "Members can view memberships in their conversations"
on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "Members can read messages"
on public.messages for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "Members can send messages as themselves"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(conversation_id)
);

-- Direct conversation creation is server-side and idempotent.
create or replace function public.create_direct_conversation(other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  found_id uuid;
  new_id uuid;
begin
  if me is null then raise exception 'You must be signed in'; end if;
  if other_user_id is null or other_user_id = me then raise exception 'Choose another user'; end if;
  if not exists (select 1 from public.profiles p where p.id = other_user_id) then raise exception 'User not found'; end if;

  select c.id into found_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = me
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = other_user_id
  where c.is_group = false
    and (select count(*) from public.conversation_members x where x.conversation_id = c.id) = 2
  limit 1;

  if found_id is not null then return found_id; end if;

  insert into public.conversations(is_group) values (false) returning id into new_id;
  insert into public.conversation_members(conversation_id, user_id) values (new_id, me), (new_id, other_user_id);
  return new_id;
end;
$$;
revoke all on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

-- Enable Supabase Realtime for new messages.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
