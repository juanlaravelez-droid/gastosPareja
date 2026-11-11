create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  contributor_id uuid not null references auth.users(id),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists goal_contributions_wallet_created_at
  on public.goal_contributions (wallet_id, created_at desc);

alter table public.goal_contributions enable row level security;

drop policy if exists "Members can read goal contributions"
  on public.goal_contributions;
create policy "Members can read goal contributions"
  on public.goal_contributions for select to authenticated
  using (public.is_wallet_member(wallet_id));

revoke all on public.goal_contributions from anon, authenticated;
grant select on public.goal_contributions to authenticated;

create or replace function public.contribute_to_goal(
  p_wallet_id uuid,
  p_goal_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
  available_amount numeric(14, 2);
  goal_row public.goals%rowtype;
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El aporte debe ser un monto mayor que cero.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;
  select * into goal_row
  from public.goals
  where id = p_goal_id and wallet_id = p_wallet_id
  for update;
  if not found then
    raise exception 'No se encontró la meta seleccionada.';
  end if;

  select
    coalesce((select sum(amount) from public.incomes where wallet_id = p_wallet_id), 0)
    - coalesce((select sum(amount) from public.expenses where wallet_id = p_wallet_id), 0)
    - coalesce((select sum(current_amount) from public.goals where wallet_id = p_wallet_id), 0)
  into available_amount;

  if p_amount > available_amount then
    raise exception 'Saldo disponible insuficiente para realizar este aporte.';
  end if;
  if goal_row.current_amount + p_amount > goal_row.target_amount then
    raise exception 'El aporte supera el monto que falta para completar esta meta.';
  end if;

  update public.goals
  set current_amount = current_amount + p_amount
  where id = p_goal_id;

  insert into public.goal_contributions (wallet_id, goal_id, contributor_id, amount)
  values (p_wallet_id, p_goal_id, auth.uid(), p_amount);
end;
$$;

revoke all on function public.contribute_to_goal(uuid, uuid, numeric) from public, anon;
grant execute on function public.contribute_to_goal(uuid, uuid, numeric) to authenticated;
