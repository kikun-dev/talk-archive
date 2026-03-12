# DB設計（初期案）

DB: Supabase Postgres

---

## 主要テーブル

users  
sources  
conversations  
conversation_active_periods  
conversation_participants  
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

## conversation_participants

会話ごとの相手側参加者を保持するテーブル。

- 1会話に対して 1 人以上の参加者を持てる
- 自分自身は保持しない
- `name` と `sort_order` を持つ
- 1 人トークか複数人トークかは参加者数で判断する
- 将来的には各レコードの発言者選択に利用する

---

## トーク種別

- text
- image
- video
- audio

---

## records が持つ主な属性

- `record_type`: text / image / video / audio
- `title`: text / image のみ任意入力、video / audio では使用しない
- `content`: text は必須、image は任意、video / audio は基本使わない
- `speaker_participant_id`: 発言者 participant を参照する
- `posted_at`: 実際の投稿日時
- `created_at`: システム作成日時
- 表示順は `posted_at` を基準にし、同一日時の安定順序は `position` で担保する

`speaker_participant_id` は `conversation_participants` を参照し、トーク詳細画面の吹き出し表示や日付検索の基準になる。

---

## ストレージ設計

メタデータ

Postgres

メディアファイル

Supabase Storage

- 会話カードのトップ画像も Storage で管理する
- `media` バケットを使用する
- 現行のメディアファイルのパス規約は `{userId}/{conversationId}/{recordId}/{filename}`
- RLS により、ユーザーは自分の `userId` プレフィックス配下のファイルのみ upload / read / delete できる
- ファイル取得は公開 URL ではなく signed URL を使う
- 詳細ページのメディア表示では、record に紐づく attachment から signed URL を生成して `image` / `video` / `audio` を描画する

---

## 将来検討

- 全文検索強化
- メディア圧縮
- OCRインポート
- バックアップ
