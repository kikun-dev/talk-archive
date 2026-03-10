create type idol_group as enum ('nogizaka', 'sakurazaka', 'hinatazaka');

alter table conversations
  add column idol_group idol_group not null default 'nogizaka',
  add column cover_image_path text;

create table conversation_active_periods (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  constraint conversation_active_periods_date_order_check check (
    end_date is null or start_date <= end_date
  )
);

create index conversation_active_periods_conversation_id_idx
  on conversation_active_periods(conversation_id);

create index conversation_active_periods_date_range_idx
  on conversation_active_periods(conversation_id, start_date, end_date);

alter table conversation_active_periods enable row level security;

create policy "Users can manage active periods in their conversations"
  on conversation_active_periods for all
  to authenticated
  using (
    exists (
      select 1 from conversations
      where conversations.id = conversation_active_periods.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from conversations
      where conversations.id = conversation_active_periods.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );
