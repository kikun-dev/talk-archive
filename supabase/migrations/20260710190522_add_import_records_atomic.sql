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

-- プレビューの重複判定に必要な値だけを返し、本文全文の転送を避ける。
-- security invoker のため records の既存 RLS がそのまま適用される。
create or replace function get_import_dedup_candidates(
  p_conversation_id uuid
)
returns table (
  participant_id uuid,
  posted_at timestamptz,
  record_type record_type,
  content_prefix text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.speaker_participant_id,
    r.posted_at,
    r.record_type,
    left(trim(coalesce(r.content, '')), 20)
  from records r
  where r.conversation_id = p_conversation_id;
$$;

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
  new_participant_name text;
  resolved_new_participant_id uuid;
  participant_name_to_id jsonb := '{}'::jsonb;
  created_participants jsonb := '{}'::jsonb;
  record_item jsonb;
  resolved_participant_id uuid;
  record_posted_at timestamptz;
  record_content_prefix text;
  duplicate_exists boolean;
  created_record_count integer := 0;
  skipped_record_count integer := 0;
begin
  -- position / sort_order の採番、および participant 解決・record 重複判定を
  -- 直列化するため会話行をロックする（#124: 重複判定・participant 解決をロック内へ）
  perform 1
  from conversations
  where id = p_conversation_id
  for update;

  select coalesce(max(sort_order) + 1, 0)
  into next_sort_order
  from conversation_participants
  where conversation_id = p_conversation_id;

  -- p_new_participants の各 name を解決する。
  -- 同名の participant が既に存在すればそれを再利用し（created_participants には含めない）、
  -- なければ新規作成する（sort_order は連番、created_participants に含める）
  for new_participant in
    select * from jsonb_array_elements(coalesce(p_new_participants, '[]'::jsonb))
  loop
    new_participant_name := new_participant->>'name';

    select id
    into resolved_new_participant_id
    from conversation_participants
    where conversation_id = p_conversation_id
      and name = new_participant_name
    limit 1;

    if resolved_new_participant_id is null then
      insert into conversation_participants (conversation_id, name, sort_order)
      values (p_conversation_id, new_participant_name, next_sort_order)
      returning id into resolved_new_participant_id;

      created_participants :=
        jsonb_set(created_participants, array[new_participant_name], to_jsonb(resolved_new_participant_id::text));

      next_sort_order := next_sort_order + 1;
    end if;

    participant_name_to_id :=
      jsonb_set(participant_name_to_id, array[new_participant_name], to_jsonb(resolved_new_participant_id::text));
  end loop;

  select coalesce(max(position) + 1, 0)
  into next_position
  from records
  where conversation_id = p_conversation_id;

  -- p_records は呼び出し側で postedAt 昇順にソート済みの前提。
  -- jsonb_array_elements は配列の順序を保持するため、その順に position を採番する
  -- （position はスキップ後の実挿入分のみ連番で振る）
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

    record_posted_at := (record_item->>'posted_at')::timestamptz;
    record_content_prefix := left(trim(coalesce(record_item->>'content', '')), 20);

    -- 解決済み participant_id + posted_at + record_type + 本文先頭20文字が一致する
    -- 既存レコード（同一会話、この呼び出し内での挿入分も含む）があればスキップする
    select exists (
      select 1
      from records r
      where r.conversation_id = p_conversation_id
        and r.speaker_participant_id = resolved_participant_id
        and r.posted_at = record_posted_at
        and r.record_type = (record_item->>'record_type')::record_type
        and left(trim(coalesce(r.content, '')), 20) = record_content_prefix
    )
    into duplicate_exists;

    if duplicate_exists then
      skipped_record_count := skipped_record_count + 1;
      continue;
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
      record_posted_at,
      next_position
    );

    next_position := next_position + 1;
    created_record_count := created_record_count + 1;
  end loop;

  return jsonb_build_object(
    'created_record_count', created_record_count,
    'skipped_record_count', skipped_record_count,
    'created_participants', created_participants
  );
end;
$$;

-- security invoker RPC が既存 RLS の下で必要な操作だけを行えるようにする。
-- 関数の既定 EXECUTE 権限（PUBLIC）は外し、認証済みユーザーに限定する。
revoke execute on function get_import_dedup_candidates(uuid) from public;
revoke execute on function import_records_atomic(uuid, jsonb, jsonb) from public;
grant execute on function get_import_dedup_candidates(uuid) to authenticated;
grant execute on function import_records_atomic(uuid, jsonb, jsonb) to authenticated;

grant select on conversations to authenticated;
grant update (id) on conversations to authenticated;
grant select, insert on conversation_participants to authenticated;
grant select, insert on records to authenticated;
