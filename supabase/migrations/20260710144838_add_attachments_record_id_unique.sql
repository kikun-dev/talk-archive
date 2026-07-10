-- 同一レコードへの二重添付を DB レベルで防ぐため、attachments(record_id) に一意制約を追加する
alter table attachments
  add constraint attachments_record_id_key unique (record_id);

-- 一意制約が作るインデックスで record_id 検索も賄えるため、重複する非一意インデックスを削除する
-- （ロールバックで制約を drop する場合は create index attachments_record_id_idx on attachments(record_id); で再作成する）
drop index attachments_record_id_idx;
