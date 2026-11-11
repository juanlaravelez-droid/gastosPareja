create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  payer_id uuid not null references auth.users(id),
  receiver_id uuid not null references auth.users(id),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  check (payer_id <> receiver_id)
);

alter table public.settlements enable row level security;

create policy "Members can read settlements"
  on public.settlements for select to authenticated
  using (public.is_wallet_member(wallet_id));

revoke all on public.settlements from anon, authenticated;
grant select on public.settlements to authenticated;

create or replace function public.delete_expense(
  p_wallet_id uuid,
  p_expense_id uuid
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
  delete from public.expenses
  where id = p_expense_id and wallet_id = p_wallet_id;
  if not found then
    raise exception 'No se encontró el gasto seleccionado.';
  end if;
end;
$$;

create or replace function public.register_settlement(
  p_wallet_id uuid,
  p_payer_id uuid,
  p_receiver_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
  payer_index smallint;
  receiver_index smallint;
  paid_cents bigint;
  owed_cents bigint;
  prior_settlements_cents bigint;
  net_cents bigint;
  available_to_settle_cents bigint;
  amount_cents bigint;
  expense_row record;
  settlement_id uuid;
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;
  if p_payer_id <> auth.uid() then
    raise exception 'Solo quien realiza el pago puede registrar la liquidación.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount * 100 <> round(p_amount * 100) then
    raise exception 'El monto a saldar debe ser positivo y tener máximo dos decimales.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;
  select member_index into payer_index
  from public.wallet_members where wallet_id = p_wallet_id and user_id = p_payer_id;
  select member_index into receiver_index
  from public.wallet_members where wallet_id = p_wallet_id and user_id = p_receiver_id;
  if payer_index is null or receiver_index is null or payer_index = receiver_index then
    raise exception 'La liquidación debe ser entre las dos personas de esta billetera.';
  end if;

  amount_cents := round(p_amount * 100)::bigint;
  select coalesce(sum(round(amount * 100)::bigint), 0)
  into paid_cents from public.expenses
  where wallet_id = p_wallet_id and author_id = p_payer_id;

  for expense_row in
    select amount from public.expenses where wallet_id = p_wallet_id
  loop
    owed_cents := coalesce(owed_cents, 0)
      + floor(round(expense_row.amount * 100)::numeric / 2)::bigint
      + case
        when payer_index = 1 and mod(round(expense_row.amount * 100)::bigint, 2) = 1 then 1
        else 0
      end;
  end loop;

  prior_settlements_cents := coalesce((
    select sum(round(amount * 100)::bigint)
    from public.settlements
    where wallet_id = p_wallet_id and payer_id = p_payer_id
  ), 0) - coalesce((
    select sum(round(amount * 100)::bigint)
    from public.settlements
    where wallet_id = p_wallet_id and receiver_id = p_payer_id
  ), 0);

  net_cents := coalesce(paid_cents, 0) - coalesce(owed_cents, 0)
    + prior_settlements_cents;
  if net_cents >= 0 then
    raise exception 'Esta persona no tiene un saldo pendiente por pagar.';
  end if;
  available_to_settle_cents := -net_cents;
  if amount_cents > available_to_settle_cents then
    raise exception 'El monto supera el saldo pendiente por liquidar.';
  end if;

  insert into public.settlements (wallet_id, payer_id, receiver_id, amount)
  values (p_wallet_id, p_payer_id, p_receiver_id, p_amount)
  returning id into settlement_id;
  return settlement_id;
end;
$$;

revoke all on function public.delete_expense(uuid, uuid) from public, anon;
grant execute on function public.delete_expense(uuid, uuid) to authenticated;
revoke all on function public.register_settlement(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.register_settlement(uuid, uuid, uuid, numeric) to authenticated;
