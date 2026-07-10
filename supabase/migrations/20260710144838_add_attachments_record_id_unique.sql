-- 同一レコードへの二重添付を DB レベルで防ぐため、attachments(record_id) に一意制約を追加する
alter table attachments
  add constraint attachments_record_id_key unique (record_id);
