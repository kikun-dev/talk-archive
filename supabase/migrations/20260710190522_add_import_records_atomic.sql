-- #114: トークJSON一括インポート用の atomic RPC
-- 新規 participant 追加と records 一括挿入を 1 トランザクションで行う。
-- position（records）・sort_order（conversation_participants）の採番は
-- 既存の append_text_record / append_media_record と同じ
-- 「conversations 行ロック + max+1」方式で直列化する。

-- 20260312000000 で append_text_record / append_media_record に
-- speaker_participant_id / posted_at 引数を追加した際、シグネチャ（引数の型・数）が
-- 変わったため create or replace が別オーバーロードとして扱ってしまい、
-- 旧シグネチャの関数が残存していた（`supabase gen types` が Union 型を生成し
-- 既存コードの型チェックを壊す）。ここで旧シグネチャを明示的に削除する
drop function if exists append_text_record(uuid, text, text);
drop function if exists append_media_record(uuid, record_type, text, text, boolean);

create or replace function import_records_atomic(
  p_conversation_id uuid,
  p_new_participants jsonb, -- [{"name": "..."}]
  p_records jsonb -- [{"participant_id": "uuid"|null, "participant_name": "..."|null, "record_type": "...", "title": ..., "content": ..., "has_audio": bool, "posted_at": "..."}]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_sort_order integer;
  next_position integer;
  new_participant jsonb;
  new_participant_id uuid;
  participant_name_to_id jsonb := '{}'::jsonb;
  created_participants jsonb := '{}'::jsonb;
  record_item jsonb;
  resolved_participant_id uuid;
  created_record_count integer := 0;
begin
  -- position / sort_order の採番を直列化するため会話行をロックする
  perform 1
  from conversations
  where id = p_conversation_id
  for update;

  select coalesce(max(sort_order) + 1, 0)
  into next_sort_order
  from conversation_participants
  where conversation_id = p_conversation_id;

  for new_participant in
    select * from jsonb_array_elements(coalesce(p_new_participants, '[]'::jsonb))
  loop
    insert into conversation_participants (conversation_id, name, sort_order)
    values (p_conversation_id, new_participant->>'name', next_sort_order)
    returning id into new_participant_id;

    participant_name_to_id :=
      jsonb_set(participant_name_to_id, array[new_participant->>'name'], to_jsonb(new_participant_id::text));
    created_participants :=
      jsonb_set(created_participants, array[new_participant->>'name'], to_jsonb(new_participant_id::text));

    next_sort_order := next_sort_order + 1;
  end loop;

  select coalesce(max(position) + 1, 0)
  into next_position
  from records
  where conversation_id = p_conversation_id;

  -- p_records は呼び出し側で postedAt 昇順にソート済みの前提。
  -- jsonb_array_elements は配列の順序を保持するため、その順に position を採番する
  for record_item in
    select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  loop
    if record_item->>'participant_id' is not null then
      resolved_participant_id := (record_item->>'participant_id')::uuid;
    else
      resolved_participant_id :=
        (participant_name_to_id->>(record_item->>'participant_name'))::uuid;

      if resolved_participant_id is null then
        raise exception 'participant not found for name: %', record_item->>'participant_name';
      end if;
    end if;

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
      (record_item->>'record_type')::record_type,
      record_item->>'title',
      record_item->>'content',
      coalesce((record_item->>'has_audio')::boolean, false),
      resolved_participant_id,
      (record_item->>'posted_at')::timestamptz,
      next_position
    );

    next_position := next_position + 1;
    created_record_count := created_record_count + 1;
  end loop;

  return jsonb_build_object(
    'created_record_count', created_record_count,
    'created_participants', created_participants
  );
end;
$$;
