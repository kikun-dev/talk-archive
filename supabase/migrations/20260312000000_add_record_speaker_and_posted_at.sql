-- Add speaker_participant_id and posted_at to records

alter table records
  add column speaker_participant_id uuid references conversation_participants(id) on delete set null,
  add column posted_at timestamptz not null default now();

-- Make speaker_participant_id NOT NULL after adding
-- (既存データなしの前提なので直接 NOT NULL にできるが、
--  default now() で posted_at を埋めた後に制約を追加する)
alter table records
  alter column speaker_participant_id set not null;

-- Index for posted_at ordering and date search
create index records_posted_at_idx on records(conversation_id, posted_at);

-- Index for speaker lookup
create index records_speaker_participant_id_idx on records(speaker_participant_id);

-- Update ordering: replace position-based unique index with posted_at + position
-- position は同一 posted_at 内の安定順序として残す
drop index if exists records_conversation_position_unique_idx;
create unique index records_conversation_position_unique_idx
  on records(conversation_id, position);

-- Update append_text_record to accept speaker and posted_at
create or replace function append_text_record(
  p_conversation_id uuid,
  p_title text,
  p_content text,
  p_speaker_participant_id uuid,
  p_posted_at timestamptz
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
    speaker_participant_id,
    posted_at,
    position
  )
  values (
    p_conversation_id,
    'text',
    p_title,
    p_content,
    p_speaker_participant_id,
    p_posted_at,
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

-- Update append_media_record to accept speaker and posted_at
create or replace function append_media_record(
  p_conversation_id uuid,
  p_record_type record_type,
  p_title text,
  p_content text,
  p_has_audio boolean,
  p_speaker_participant_id uuid,
  p_posted_at timestamptz
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
    speaker_participant_id,
    posted_at,
    position
  )
  values (
    p_conversation_id,
    p_record_type,
    p_title,
    p_content,
    p_has_audio,
    p_speaker_participant_id,
    p_posted_at,
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
