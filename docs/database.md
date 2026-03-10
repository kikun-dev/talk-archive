# DB設計（初期案）

DB: Supabase Postgres

---

## 主要テーブル

users  
sources  
conversations  
conversation_active_periods  
records  
attachments

---

## conversations が持つ主な属性

- `idol_group`: 乃木坂 / 櫻坂 / 日向坂の固定分類
- `cover_image_path`: 会話カード用トップ画像の参照先
- `source_id`: LINE 等のトーク出所（アイドルグループ分類とは別）

---

## conversation_active_periods

会話ごとの期間区間を保持するテーブル。

- 1会話に対して複数区間を持てる
- `start_date` は必須
- `end_date` は任意
- `end_date` が `null` の場合は現在進行中
- 会話期間日数は複数区間の和集合を日単位で数える
- ギャップ期間は日数に含めない

---

## トーク種別

- text
- image
- video
- audio

---

## ストレージ設計

メタデータ

Postgres

メディアファイル

Supabase Storage

- 会話カードのトップ画像も Storage で管理する

---

## 将来検討

- 全文検索強化
- メディア圧縮
- OCRインポート
- バックアップ
