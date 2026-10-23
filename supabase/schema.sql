create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nombre_miembro1 text not null check (char_length(btrim(nombre_miembro1)) >= 2),
  nombre_miembro2 text not null check (char_length(btrim(nombre_miembro2)) >= 2),
  created_at timestamptz not null default now()
);

create table public.wallet_members (
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_index smallint not null check (member_index in (1, 2)),
  joined_at timestamptz not null default now(),
  primary key (wallet_id, user_id),
  unique (wallet_id, member_index),
  unique (user_id)
);

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  description text not null check (char_length(btrim(description)) >= 2),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  title text not null check (char_length(btrim(title)) >= 3),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date date,
  current_amount numeric(14, 2) not null default 0 check (
    current_amount >= 0 and current_amount <= target_amount
  ),
  created_at timestamptz not null default now()
);

create table public.wallet_invites (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  created_at timestamptz not null default now()
);

create unique index wallet_invites_one_pending_email
  on public.wallet_invites (lower(email))
  where status = 'pending';

create or replace function public.is_wallet_member(target_wallet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wallet_members
    where wallet_id = target_wallet_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.add_wallet_owner_as_first_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallet_members (wallet_id, user_id, member_index)
  values (new.id, new.owner_id, 1);
  return new;
end;
$$;

create trigger wallet_owner_membership
after insert on public.wallets
for each row execute function public.add_wallet_owner_as_first_member();

create or replace function public.create_wallet(
  p_nombre_miembro1 text,
  p_nombre_miembro2 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_wallet_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para crear una billetera.';
  end if;
  if char_length(btrim(p_nombre_miembro1)) < 2
    or char_length(btrim(p_nombre_miembro2)) < 2 then
    raise exception 'Ambos nombres deben tener al menos 2 caracteres.';
  end if;
  if exists (select 1 from public.wallet_members where user_id = auth.uid()) then
    raise exception 'Esta cuenta ya pertenece a una billetera.';
  end if;

  insert into public.wallets (owner_id, nombre_miembro1, nombre_miembro2)
  values (auth.uid(), btrim(p_nombre_miembro1), btrim(p_nombre_miembro2))
  returning id into new_wallet_id;

  return new_wallet_id;
end;
$$;

create or replace function public.update_wallet_names(
  p_wallet_id uuid,
  p_nombre_miembro1 text,
  p_nombre_miembro2 text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;
  if char_length(btrim(p_nombre_miembro1)) < 2
    or char_length(btrim(p_nombre_miembro2)) < 2 then
    raise exception 'Ambos nombres deben tener al menos 2 caracteres.';
  end if;

  update public.wallets
  set nombre_miembro1 = btrim(p_nombre_miembro1),
      nombre_miembro2 = btrim(p_nombre_miembro2)
  where id = p_wallet_id;
end;
$$;

create or replace function public.register_expense(
  p_wallet_id uuid,
  p_description text,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
  available_amount numeric(14, 2);
  expense_id uuid;
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del gasto debe ser mayor que cero.';
  end if;
  if char_length(btrim(p_description)) < 2 then
    raise exception 'La descripción debe tener al menos 2 caracteres.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;

  select
    coalesce((select sum(amount) from public.incomes where wallet_id = p_wallet_id), 0)
    - coalesce((select sum(amount) from public.expenses where wallet_id = p_wallet_id), 0)
    - coalesce((select sum(current_amount) from public.goals where wallet_id = p_wallet_id), 0)
  into available_amount;

  if p_amount > available_amount then
    raise exception 'Saldo disponible insuficiente para registrar este gasto.';
  end if;

  insert into public.expenses (wallet_id, author_id, description, amount)
  values (p_wallet_id, auth.uid(), btrim(p_description), p_amount)
  returning id into expense_id;

  return expense_id;
end;
$$;

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
end;
$$;

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

create or replace function public.delete_income(
  p_wallet_id uuid,
  p_income_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
  remaining_income numeric(14, 2);
  assigned_amount numeric(14, 2);
begin
  if auth.uid() is null or not public.is_wallet_member(p_wallet_id) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;
  if not exists (
    select 1 from public.incomes
    where id = p_income_id and wallet_id = p_wallet_id
  ) then
    raise exception 'No se encontró el ingreso seleccionado.';
  end if;

  select coalesce(sum(amount), 0) into remaining_income
  from public.incomes
  where wallet_id = p_wallet_id and id <> p_income_id;
  select coalesce(sum(amount), 0) into assigned_amount
  from public.expenses
  where wallet_id = p_wallet_id;
  assigned_amount := assigned_amount + coalesce((
    select sum(current_amount) from public.goals where wallet_id = p_wallet_id
  ), 0);

  if remaining_income < assigned_amount then
    raise exception 'No puedes eliminar este ingreso porque los fondos ya están asignados o gastados.';
  end if;

  delete from public.incomes where id = p_income_id and wallet_id = p_wallet_id;
end;
$$;

create or replace function public.accept_wallet_invitation(
  p_user_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_invite public.wallet_invites%rowtype;
  member_count integer;
  verified_email text;
begin
  select lower(email) into verified_email
  from auth.users
  where id = p_user_id;
  if verified_email is null or verified_email <> lower(btrim(p_email)) then
    raise exception 'El correo de la sesión no coincide con la invitación.';
  end if;

  if exists (select 1 from public.wallet_members where user_id = p_user_id) then
    return true;
  end if;

  select * into pending_invite
  from public.wallet_invites
  where lower(email) = verified_email and status = 'pending'
  for update;
  if not found then
    return false;
  end if;

  perform id from public.wallets where id = pending_invite.wallet_id for update;
  select count(*) into member_count
  from public.wallet_members
  where wallet_id = pending_invite.wallet_id;
  if member_count >= 2 then
    raise exception 'La billetera ya tiene dos integrantes.';
  end if;

  insert into public.wallet_members (wallet_id, user_id, member_index)
  values (pending_invite.wallet_id, p_user_id, 2);
  update public.wallet_invites
  set status = 'cancelled'
  where wallet_id = pending_invite.wallet_id
    and status = 'pending'
    and id <> pending_invite.id;
  update public.wallet_invites set status = 'accepted' where id = pending_invite.id;
  return true;
end;
$$;

create or replace function public.create_wallet_invitation(
  p_wallet_id uuid,
  p_email text,
  p_invited_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_lock uuid;
  invitee_id uuid;
  member_count integer;
  new_invite_id uuid;
begin
  if not exists (
    select 1 from public.wallet_members
    where wallet_id = p_wallet_id and user_id = p_invited_by
  ) then
    raise exception 'No tienes acceso a esta billetera.';
  end if;
  if p_email is null or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Indica un correo válido.';
  end if;

  select id into wallet_lock from public.wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'No se encontró la billetera.';
  end if;

  select count(*) into member_count
  from public.wallet_members where wallet_id = p_wallet_id;
  if member_count >= 2 then
    raise exception 'La billetera ya tiene dos integrantes.';
  end if;

  select id into invitee_id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;
  if invitee_id is not null and exists (
    select 1 from public.wallet_members where user_id = invitee_id
  ) then
    raise exception 'Ese correo ya está vinculado a una billetera.';
  end if;

  insert into public.wallet_invites (wallet_id, email, invited_by)
  values (p_wallet_id, lower(btrim(p_email)), p_invited_by)
  returning id into new_invite_id;

  return new_invite_id;
end;
$$;

alter table public.wallets enable row level security;
alter table public.wallet_members enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.goals enable row level security;
alter table public.wallet_invites enable row level security;

create policy "Members can read their wallets"
  on public.wallets for select to authenticated
  using (public.is_wallet_member(id));

create policy "Members can read wallet membership"
  on public.wallet_members for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy "Members can read incomes"
  on public.incomes for select to authenticated
  using (public.is_wallet_member(wallet_id));
create policy "Members can add incomes for wallet members"
  on public.incomes for insert to authenticated
  with check (
    public.is_wallet_member(wallet_id)
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.wallet_members as author_member
      where author_member.wallet_id = incomes.wallet_id
        and author_member.user_id = incomes.author_id
    )
  );

create policy "Members can read expenses"
  on public.expenses for select to authenticated
  using (public.is_wallet_member(wallet_id));

create policy "Members can read goals"
  on public.goals for select to authenticated
  using (public.is_wallet_member(wallet_id));
create policy "Members can create goals"
  on public.goals for insert to authenticated
  with check (
    public.is_wallet_member(wallet_id)
    and current_amount = 0
  );

revoke all on public.wallets, public.wallet_members, public.incomes, public.expenses, public.goals, public.wallet_invites
  from anon, authenticated;

grant select on public.wallets, public.wallet_members, public.incomes, public.expenses, public.goals to authenticated;
grant insert on public.incomes to authenticated;
grant insert on public.goals to authenticated;

revoke all on public.wallet_invites from anon, authenticated;
revoke all on function public.is_wallet_member(uuid) from public, anon;
grant execute on function public.is_wallet_member(uuid) to authenticated, service_role;
revoke all on function public.create_wallet(text, text) from public, anon;
grant execute on function public.create_wallet(text, text) to authenticated;
revoke all on function public.update_wallet_names(uuid, text, text) from public, anon;
grant execute on function public.update_wallet_names(uuid, text, text) to authenticated;
revoke all on function public.register_expense(uuid, text, numeric) from public, anon;
grant execute on function public.register_expense(uuid, text, numeric) to authenticated;
revoke all on function public.contribute_to_goal(uuid, uuid, numeric) from public, anon;
grant execute on function public.contribute_to_goal(uuid, uuid, numeric) to authenticated;
revoke all on function public.update_goal(uuid, uuid, text, numeric, date) from public, anon;
grant execute on function public.update_goal(uuid, uuid, text, numeric, date) to authenticated;
revoke all on function public.delete_goal(uuid, uuid) from public, anon;
grant execute on function public.delete_goal(uuid, uuid) to authenticated;
revoke all on function public.delete_income(uuid, uuid) from public, anon;
grant execute on function public.delete_income(uuid, uuid) to authenticated;
revoke all on function public.accept_wallet_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_wallet_invitation(uuid, text) to service_role;
revoke all on function public.create_wallet_invitation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_wallet_invitation(uuid, text, uuid) to service_role;
revoke all on function public.add_wallet_owner_as_first_member() from public, anon, authenticated;
