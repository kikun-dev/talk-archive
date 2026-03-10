drop index if exists records_position_idx;

create unique index if not exists records_conversation_position_unique_idx
  on records(conversation_id, position);

create or replace function append_text_record(
  p_conversation_id uuid,
  p_title text,
  p_content text
)
returns setof records
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_record records%rowtype;
begin
  perform 1
  from conversations
  where id = p_conversation_id
  for update;

  insert into records (
    conversation_id,
    record_type,
    title,
    content,
    position
  )
  values (
    p_conversation_id,
    'text',
    p_title,
    p_content,
    coalesce(
      (
        select max(position) + 1
        from records
        where conversation_id = p_conversation_id
      ),
      0
    )
  )
  returning * into inserted_record;

  return next inserted_record;
end;
$$;
