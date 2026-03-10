# アーキテクチャルール

このファイルはプロジェクト全体で守るべきアーキテクチャ上の規則を定義する。
CLAUDE.md の「アーキテクチャ前提（A運用）」を具体化したもの。

---

## レイヤー構成

```
UI層（src/app/, src/components/）
  ↓ 呼び出す
UseCase層（src/usecases/）
  ↓ 呼び出す
Data/Repository層（src/repositories/）
  ↓ アクセスする
外部サービス（Supabase, Storage）
```

### 各レイヤーの責務

| レイヤー | 配置先 | 責務 | 許可される依存 |
|---------|--------|------|---------------|
| UI | `src/app/`, `src/components/` | 表示・ユーザー操作・Server Actions の定義 | UseCase, types |
| UseCase | `src/usecases/` | ビジネスロジック・バリデーション・オーケストレーション | Repository, types |
| Repository | `src/repositories/` | DB/Storage/API アクセス（副作用） | lib（Supabase client）, types |
| Lib | `src/lib/` | Supabase クライアント等のユーティリティ | 外部ライブラリのみ |
| Types | `src/types/` | 型定義 | なし（純粋な型のみ） |

---

## 依存方向のルール

依存は **上から下への一方向のみ** 許可する。

- UI → UseCase → Repository → 外部サービス

### 禁止パターン

- Repository が UseCase を import する
- UseCase が UI コンポーネントを import する
- Repository が別の Repository を直接呼ぶ（UseCase で合成する）
- `src/types/` が他のレイヤーを import する

---

## UI 層のルール

- ビジネスロジックを UI 層に書かない
  - バリデーション、データ変換、条件分岐は UseCase に置く
  - UI 側のバリデーションは UX 目的のみ（サーバー側で必ず再検証）
- Server Actions は UI 層に定義し、UseCase を呼び出すだけにする
- Server Components をデフォルトとし、`"use client"` は必要な箇所のみ

---

## UseCase 層のルール

- 副作用を直接持たない（DB アクセス等は Repository 経由）
- 1 つの UseCase 関数は 1 つの操作を表す
- 複数の Repository を組み合わせる場合はここで行う
- 入力バリデーションはここで行う

---

## Repository 層のルール

- Supabase クライアント経由でのみ外部アクセスする
- 生の SQL は原則使わない（Supabase クエリビルダーを使用）
- 戻り値は型付きのドメインオブジェクトにする
- エラーハンドリングは呼び出し元に委ねる（例外を throw するか Result 型を返す）

---

## 型定義のルール

- `any` 禁止
- 型は明示的に書く（過度な型推論に頼らない）
- ドメイン型は `src/types/` に集約する
- Supabase 生成型（`Database`）は `src/types/database.ts` に配置し、Repository 層でのみ直接参照する
- UseCase/UI 層はドメイン型を使用する（DB スキーマの詳細を漏洩させない）

---

## 命名規則

- boolean: `isX` / `hasX` / `canX`
- バリデーション関数: `validateX`
- Repository 関数: `getX`, `createX`, `updateX`, `deleteX`
- UseCase 関数: 操作を表す動詞 (`listConversations`, `addTextRecord`)
