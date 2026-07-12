-- #133: .eml インポートで複数画像を全件登録するにあたり、eml 由来の各レコードを
-- 安定したキー（"<元ファイル名>#<連番>"）で重複排除できるようにする。
-- records に import_key 列を追加し、import_records_atomic の重複判定を
-- import_key が非nullならそれを優先するよう変更する（JSON インポートは import_key が
-- 常に null のため、既存の本文プレフィックスベースの判定を維持する）

alter table records add column import_key text;

create index records_import_key_idx
  on records (conversation_id, import_key)
  where import_key is not null;

-- 20260711090000 で導入した関数（created_record_ids 追加版）を、シグネチャ不変のまま
-- create or replace で置き換える（後方互換）
create or replace function import_records_atomic(
  p_conversation_id uuid,
  p_new_participants jsonb, -- [{"name": "..."}]
  p_records jsonb -- [{"participant_id": "uuid"|null, "participant_name": "..."|null, "record_type": "...", "title": ..., "content": ..., "has_audio": bool, "posted_at": "...", "import_key": "..."|null}]
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
  item record;
  record_item jsonb;
  record_index integer;
  resolved_participant_id uuid;
  record_posted_at timestamptz;
  record_content_prefix text;
  record_import_key text;
  duplicate_exists boolean;
  created_record_count integer := 0;
  skipped_record_count integer := 0;
  new_record_id uuid;
  created_record_ids jsonb := '[]'::jsonb;
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
  -- jsonb_array_elements with ordinality で配列内の元の index（0始まり）を取得し、
  -- created_record_ids の対応付けに使う（position はスキップ後の実挿入分のみ連番で振る）
  for item in
    select elem, ord - 1 as idx
    from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) with ordinality as t(elem, ord)
  loop
    record_item := item.elem;
    record_index := item.idx;

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
    record_import_key := record_item->>'import_key';

    -- import_key が指定されている場合（.eml インポート由来）は、同一会話内で
    -- import_key が一致する既存レコードの有無だけで重複判定する（#133: 1メールから
    -- 複数レコードを作る場合、participant_id + posted_at + record_type + 本文先頭20文字
    -- が同一になり得るため、本文プレフィックスベースの判定では誤って重複扱いされてしまう）。
    -- import_key が無い場合（JSON インポート由来）は、従来どおり
    -- participant_id + posted_at + record_type + 本文先頭20文字が一致する
    -- 既存レコード（同一会話、この呼び出し内での挿入分も含む）があればスキップする
    if record_import_key is not null then
      select exists (
        select 1
        from records r
        where r.conversation_id = p_conversation_id
          and r.import_key = record_import_key
      )
      into duplicate_exists;
    else
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
    end if;

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
      position,
      import_key
    )
    values (
      p_conversation_id,
      (record_item->>'record_type')::record_type,
      record_item->>'title',
      record_item->>'content',
      coalesce((record_item->>'has_audio')::boolean, false),
      resolved_participant_id,
      record_posted_at,
      next_position,
      record_import_key
    )
    returning id into new_record_id;

    created_record_ids :=
      created_record_ids || jsonb_build_array(
        jsonb_build_object('index', record_index, 'id', new_record_id::text)
      );

    next_position := next_position + 1;
    created_record_count := created_record_count + 1;
  end loop;

  return jsonb_build_object(
    'created_record_count', created_record_count,
    'skipped_record_count', skipped_record_count,
    'created_participants', created_participants,
    'created_record_ids', created_record_ids
  );
end;
$$;

-- create or replace はシグネチャ不変のため権限・grant はそのまま維持される想定だが、
-- 念のため既存 migration と同じ grant を明示しておく
revoke execute on function import_records_atomic(uuid, jsonb, jsonb) from public;
grant execute on function import_records_atomic(uuid, jsonb, jsonb) to authenticated;

-- #133 第2ラウンドレビュー対応 P1-1: get_import_dedup_candidates（プレビュー用の重複判定
-- 候補取得）が import_key を返さないままだと、プレビュー側（buildExistingDedupKeys）は
-- 常に本文プレフィックスベースのキーしか組み立てられない。一方 import_records_atomic
-- RPC は import_key が非nullの既存レコードを import_key の一致のみで重複判定するため、
-- 同一 .eml 群を再インポートした際、プレビューでは「重複なし」と表示されるのに実行時は
-- 全件スキップされる、という不整合が起きる。get_import_dedup_candidates に import_key を
-- 追加で返すよう作り直し、プレビューと実行の重複判定契約を一致させる。
-- returns table への列追加は戻り値の型を変えるため、create or replace ではなく
-- 明示的に drop してから create し直す
drop function if exists get_import_dedup_candidates(uuid);

create function get_import_dedup_candidates(
  p_conversation_id uuid
)
returns table (
  participant_id uuid,
  posted_at timestamptz,
  record_type record_type,
  content_prefix text,
  import_key text
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
    left(trim(coalesce(r.content, '')), 20),
    r.import_key
  from records r
  where r.conversation_id = p_conversation_id;
$$;

revoke execute on function get_import_dedup_candidates(uuid) from public;
grant execute on function get_import_dedup_candidates(uuid) to authenticated;
