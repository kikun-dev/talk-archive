# DB設計（初期案）

DB: Supabase Postgres

---

## 主要テーブル

users  
sources  
conversations  
records  
attachments

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

---

## 将来検討

- 全文検索強化
- メディア圧縮
- OCRインポート
- バックアップ