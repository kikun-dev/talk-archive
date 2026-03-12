-- Issue #79: participant の差分更新（全削除・再作成 → UPDATE既存 + INSERT新規、DELETE禁止）
--
-- 既存の update_conversation_with_metadata を差し替える。
-- p_participants JSONB の各要素に id（UUID | null）を持たせ、
--   - id が非 null → UPDATE name, sort_order
--   - id が null   → INSERT（新規追加）
-- 既存 participant の削除は行わない。

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
  jsonb,
  boolean,
  jsonb,
  boolean
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
  participant record;
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
    -- 既存 participant の更新（name, sort_order）
    for participant in
      select p.id, p.name, p.sort_order
      from jsonb_to_recordset(coalesce(p_participants, '[]'::jsonb)) as p(
        id uuid,
        name text,
        sort_order integer
      )
      where p.id is not null
    loop
      update conversation_participants
      set name = participant.name,
          sort_order = participant.sort_order
      where id = participant.id
        and conversation_id = p_conversation_id;
    end loop;

    -- 新規 participant の追加
    insert into conversation_participants (
      conversation_id,
      name,
      sort_order
    )
    select
      p_conversation_id,
      p.name,
      p.sort_order
    from jsonb_to_recordset(coalesce(p_participants, '[]'::jsonb)) as p(
      id uuid,
      name text,
      sort_order integer
    )
    where p.id is null;
  end if;

  return next updated_conversation;
end;
$$;
