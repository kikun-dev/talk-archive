create or replace function create_conversation_with_metadata(
  p_user_id uuid,
  p_title text,
  p_idol_group idol_group,
  p_source_id uuid,
  p_cover_image_path text,
  p_active_periods jsonb
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

  return next inserted_conversation;
end;
$$;

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
  p_active_periods jsonb
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

  return next updated_conversation;
end;
$$;
