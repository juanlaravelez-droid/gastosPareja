alter table public.goals
  add column if not exists target_date date;
