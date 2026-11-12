alter table public.goals
  add column if not exists cover_image_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'goal-covers',
  'goal-covers',
  false,
  1572864,
  array['image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Wallet members can read goal covers" on storage.objects;
create policy "Wallet members can read goal covers"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'goal-covers'
    and exists (
      select 1
      from public.wallet_members as member
      where member.wallet_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Wallet members can upload goal covers" on storage.objects;
create policy "Wallet members can upload goal covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'goal-covers'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.jpg$'
    and exists (
      select 1
      from public.wallet_members as member
      where member.wallet_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Wallet members can delete goal covers" on storage.objects;
create policy "Wallet members can delete goal covers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'goal-covers'
    and exists (
      select 1
      from public.wallet_members as member
      where member.wallet_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
    )
  );

create or replace function public.set_goal_cover(
  p_wallet_id uuid,
  p_goal_id uuid,
  p_cover_path text
)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;

  perform 1
  from public.goals
  where id = p_goal_id and wallet_id = p_wallet_id
  for update;
  if not found then
    raise exception 'No se encontró la meta seleccionada.';
  end if;

  if p_cover_path is not null then
    if p_cover_path !~ (
      '^' || p_wallet_id::text || '/' || p_goal_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    ) then
      raise exception 'La ruta de la portada no corresponde a esta meta.';
    end if;
    if not exists (
      select 1
      from storage.objects
      where bucket_id = 'goal-covers' and name = p_cover_path
    ) then
      raise exception 'No se encontró el archivo de portada seleccionado.';
    end if;
  end if;

  update public.goals
  set cover_image_path = p_cover_path
  where id = p_goal_id and wallet_id = p_wallet_id;
end;
$$;

revoke all on function public.set_goal_cover(uuid, uuid, text) from public, anon;
grant execute on function public.set_goal_cover(uuid, uuid, text) to authenticated;
