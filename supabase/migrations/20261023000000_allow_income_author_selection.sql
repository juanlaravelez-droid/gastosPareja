alter table public.incomes
  add column if not exists created_by uuid references auth.users(id);

update public.incomes
set created_by = author_id
where created_by is null;

alter table public.incomes
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

drop policy if exists "Members can add incomes as themselves" on public.incomes;
drop policy if exists "Members can add incomes for wallet members" on public.incomes;

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
