create or replace function public.update_goal(
  p_wallet_id uuid,
  p_goal_id uuid,
  p_title text,
  p_target_amount numeric,
  p_target_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
  goal_row public.goals%rowtype;
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;
  if char_length(btrim(p_title)) < 3 then
    raise exception 'El nombre de la meta debe tener al menos 3 caracteres.';
  end if;
  if p_target_amount is null or p_target_amount <= 0 then
    raise exception 'El monto objetivo debe ser mayor que cero.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;
  select * into goal_row
  from public.goals
  where id = p_goal_id and wallet_id = p_wallet_id
  for update;
  if not found then
    raise exception 'No se encontró la meta seleccionada.';
  end if;
  if p_target_amount < goal_row.current_amount then
    raise exception 'El monto objetivo no puede ser menor a lo que ya han ahorrado.';
  end if;

  update public.goals
  set title = btrim(p_title),
      target_amount = p_target_amount,
      target_date = p_target_date
  where id = p_goal_id and wallet_id = p_wallet_id;
end;
$$;

create or replace function public.delete_goal(
  p_wallet_id uuid,
  p_goal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;
  delete from public.goals
  where id = p_goal_id and wallet_id = p_wallet_id;
  if not found then
    raise exception 'No se encontró la meta seleccionada.';
  end if;
end;
$$;

revoke all on function public.update_goal(uuid, uuid, text, numeric, date) from public, anon;
grant execute on function public.update_goal(uuid, uuid, text, numeric, date) to authenticated;
revoke all on function public.delete_goal(uuid, uuid) from public, anon;
grant execute on function public.delete_goal(uuid, uuid) to authenticated;
