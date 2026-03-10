create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint conversation_participants_name_check check (char_length(trim(name)) > 0)
);

create index conversation_participants_conversation_id_idx
  on conversation_participants(conversation_id);

create unique index conversation_participants_conversation_sort_order_unique_idx
  on conversation_participants(conversation_id, sort_order);

alter table conversation_participants enable row level security;

create policy "Users can manage participants in their conversations"
  on conversation_participants for all
  to authenticated
  using (
    exists (
      select 1 from conversations
      where conversations.id = conversation_participants.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from conversations
      where conversations.id = conversation_participants.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );

drop function if exists create_conversation_with_metadata(
  uuid,
  text,
  idol_group,
  uuid,
  text,
  jsonb
);

create or replace function create_conversation_with_metadata(
  p_user_id uuid,
  p_title text,
  p_idol_group idol_group,
  p_source_id uuid,
  p_cover_image_path text,
  p_active_periods jsonb,
  p_participants jsonb
)
returns setof conversations
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_conversation conversations%rowtype;
begin
  insert into conversations (
    user_id,
    title,
    idol_group,
    source_id,
    cover_image_path
  )
  values (
    p_user_id,
    p_title,
    p_idol_group,
    p_source_id,
    p_cover_image_path
  )
  returning * into inserted_conversation;

  insert into conversation_active_periods (
    conversation_id,
    start_date,
    end_date
  )
  select
    inserted_conversation.id,
    period.start_date,
    period.end_date
  from jsonb_to_recordset(coalesce(p_active_periods, '[]'::jsonb)) as period(
    start_date date,
    end_date date
  );

  insert into conversation_participants (
    conversation_id,
    name,
    sort_order
  )
  select
    inserted_conversation.id,
    participant.name,
    participant.sort_order
  from jsonb_to_recordset(coalesce(p_participants, '[]'::jsonb)) as participant(
    name text,
    sort_order integer
  );

  return next inserted_conversation;
end;
$$;

drop function if exists update_conversation_with_metadata(
  uuid,
  text,
  boolean,
  idol_group,
  boolean,
  uuid,
  boolean,
  text,
  boolean,
  jsonb
);

create or replace function update_conversation_with_metadata(
  p_conversation_id uuid,
  p_title text,
  p_has_title boolean,
  p_idol_group idol_group,
  p_has_idol_group boolean,
  p_source_id uuid,
  p_has_source_id boolean,
  p_cover_image_path text,
  p_has_cover_image_path boolean,
  p_active_periods jsonb,
  p_has_active_periods boolean,
  p_participants jsonb,
  p_has_participants boolean
)
returns setof conversations
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_conversation conversations%rowtype;
begin
  update conversations
  set
    title = case when p_has_title then p_title else title end,
    idol_group = case when p_has_idol_group then p_idol_group else idol_group end,
    source_id = case when p_has_source_id then p_source_id else source_id end,
    cover_image_path = case
      when p_has_cover_image_path then p_cover_image_path
      else cover_image_path
    end
  where id = p_conversation_id
  returning * into updated_conversation;

  if p_has_active_periods then
    delete from conversation_active_periods
    where conversation_id = p_conversation_id;

    insert into conversation_active_periods (
      conversation_id,
      start_date,
      end_date
    )
    select
      p_conversation_id,
      period.start_date,
      period.end_date
    from jsonb_to_recordset(coalesce(p_active_periods, '[]'::jsonb)) as period(
      start_date date,
      end_date date
    );
  end if;

  if p_has_participants then
    delete from conversation_participants
    where conversation_id = p_conversation_id;

    insert into conversation_participants (
      conversation_id,
      name,
      sort_order
    )
    select
      p_conversation_id,
      participant.name,
      participant.sort_order
    from jsonb_to_recordset(coalesce(p_participants, '[]'::jsonb)) as participant(
      name text,
      sort_order integer
    );
  end if;

  return next updated_conversation;
end;
$$;
