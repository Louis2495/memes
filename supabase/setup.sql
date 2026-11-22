begin;

create table if not exists public.meme_removals (
  meme_id text primary key check (meme_id ~ '^[a-z0-9-]{1,80}$')
);

alter table public.meme_removals enable row level security;
revoke all on public.meme_removals from public, anon, authenticated;

create or replace function public.is_meme_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = 'louisanderson477@gmail.com'
      and email_confirmed_at is not null
  );
$$;

create or replace function public.removed_meme_ids()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(meme_id), '[]'::jsonb) from public.meme_removals;
$$;

create or replace function public.remove_meme(meme_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_meme_admin() then
    raise insufficient_privilege using message = 'Admin sign-in required.';
  end if;
  insert into public.meme_removals values ($1) on conflict do nothing;
end;
$$;

revoke all on function public.is_meme_admin() from public, anon, authenticated;
grant execute on function public.is_meme_admin() to authenticated;
revoke all on function public.removed_meme_ids() from public, anon, authenticated;
grant execute on function public.removed_meme_ids() to anon, authenticated;
revoke all on function public.remove_meme(text) from public, anon, authenticated;
grant execute on function public.remove_meme(text) to authenticated;

commit;
