create or replace function append_media_record(
  p_conversation_id uuid,
  p_record_type record_type,
  p_title text,
  p_content text,
  p_has_audio boolean
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
    has_audio,
    position
  )
  values (
    p_conversation_id,
    p_record_type,
    p_title,
    p_content,
    p_has_audio,
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
