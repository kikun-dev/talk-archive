---
name: design-issue
description: GitHub Issueテンプレートとプロジェクト共通ルールに沿って、設計提案や監査FindingをFeature・Refactor・Decision・Bug・ChoreのIssueへ整理して起票する。「Issue化して」「Issueを作って」「設計Issueを起票」「FindingをIssueにして」などで使う。日本語本文、設計判断、Acceptance Criteria、関連Issue・文書更新、--draftに対応する。
---

# 設計Issue起票

`.github/ISSUE_TEMPLATE/`、`AGENTS.md`、`docs/ai/ai-collaboration.md` を正式な参照元として、Claude / Codexのどちらからでも同じ基準でGitHub Issueを作成する。Claude固有の運用文書を本Skillの判断根拠にしない。

## 引数

- `内容`: Issueにしたい内容。会話や指定文書から特定できる場合は省略可。
- `--draft`: GitHub Issueを作成せず、本文案の提示で止める。

## 参照順序

作業前に次を読む。

1. `.github/ISSUE_TEMPLATE/` 内の現行テンプレート
2. `AGENTS.md`
3. `docs/ai/ai-collaboration.md`
4. Issueの根拠として指定された文書、既存Issue、ADR

リポジトリの上位ルールやADRが優先される場合は `AGENTS.md` の優先順位に従う。設計議論はIssueへ集約し、PRを設計議論の場にしない。

## 手順

### 1. 入力と既存判断を確認する

- ユーザーの依頼、会話、指定文書、関連Issueを読む。
- すでに確定した判断と未決事項を分ける。
- ユーザーまたは既存Issueで判断が確定している場合は、その内容を `Decision` へ記載し、未決事項として扱い直さない。
- 判断の経緯が記録済みなら保持する。新しい選択肢を作って決定を再度開かない。
- Issue種別、スコープ、確定判断を根拠から決められない場合だけ、作成前にユーザーへ確認する。

### 2. Issue種別を判定する

観察された問題と必要な変更の性質から判定する。監査Finding由来であること自体を種別判定に使わない。

| 種別 | 判定基準 | テンプレート | ラベル | タイトル接頭辞 |
|---|---|---|---|---|
| Feature | 振る舞いが変わる、または機能・ユーザー体験を追加・改善する | `feature.yml` | `type:feature` | `[Feature] ` |
| Refactor | 外部の振る舞いを変えずに構造を改善する | `refactor.yml` | `type:refactor` | `[Refactor] ` |
| Decision | 実装前の設計判断だけを行う | `decision.yml` | `type:decision` | `[Decision] ` |
| Bug | 期待済み・仕様済みの挙動と実際の挙動の不一致を修正する | `bug.yml` | `type:bug` | `[Bug] ` |
| Chore | 開発環境、設定、運用、ドキュメントなどを変更する | テンプレートなし | `type:chore` | `[Chore] ` |

判定の違いがスコープやAcceptance Criteriaを変える場合は、推測せずユーザーへ確認する。

### 3. テンプレートを厳密に再現する

選んだYAMLテンプレートを毎回読み、フィールドの見出し、順序、必須項目、固定値を厳密に再現する。テンプレートの記憶や本Skillの例だけで本文を組み立てない。

- Feature: 背景 / Goals / Non-goals / Acceptance Criteria / Constraints / Design notes / Tasks
- Refactor: 背景 / スコープ / リスク・影響範囲 / 完了条件 / Tasks
- Decision: Context / Options / Evaluation / Decision / Consequences / ADR昇格
- Bug: 概要 / 再現手順 / 期待する挙動 / 実際の挙動 / 環境情報 / 修正方針メモ
- Chore: テンプレートがないため、内容に必要な見出しを使う。共通設計提案フォーマットが必要な場合はそのまま使う。

テンプレートの固定文、特にFeatureの `Constraints` 初期値を勝手に書き換えない。

### 4. 共通の設計提案フォーマットを適用する

設計提案は次の論理構成で整理する。

1. Goals
2. Non-goals
3. Constraints
4. Options
5. Recommendation
6. Trade-offs
7. Decision
8. Implementation Plan

テンプレートに同名フィールドがある項目は、そのフィールドへ記載する。その他は `Design notes`、`Evaluation`、`Consequences`、`修正方針メモ`、`Tasks` など意味が対応するフィールド内の小見出しとして記載する。トップレベルのテンプレート構造は変更しない。

代表的な対応は次のとおり。

- `Goals` / `Non-goals` / `Constraints`: 同名フィールド、またはContext・背景・スコープ内
- `Options` / `Recommendation` / `Trade-offs` / `Decision`: Design notesまたはDecisionテンプレートの対応欄
- `Implementation Plan`: Tasks。Decision Issueでは決定後の後続Issueや実装順序としてConsequences内に記載してよい

#### 判断が未確定の場合

- `Options` に実行可能な選択肢を書く。
- `Recommendation` に推奨案と根拠を書く。
- `Trade-offs` に推奨案を含む各案の利点・欠点を書く。
- `Decision` は空欄のままにする。未決定であることを決定文として書かない。

#### 判断が確定済みの場合

- 確定済みの判断を `Decision` に明記する。
- 確定根拠となるユーザー指示または既存Issueを参照する。
- `Options`、`Recommendation`、`Trade-offs` は、確定済みの経緯として根拠に存在する内容だけを保持する。代替案を新たに作って議論を再開しない。

### 5. Acceptance Criteriaと実装計画を書く

- Acceptance Criteriaまたは完了条件は、完了を客観的に判断できる条件にする。
- ユーザーに観察可能な結果、対象範囲、重要な状態、回帰防止、必要な検証を含める。
- 特定のUI実装方法、コンポーネント構造、ライブラリ、内部APIを、設計判断なしに固定しない。
- 実装手段の選択が必要ならAcceptance CriteriaではなくDesign notesで比較する。
- `AGENTS.md` と `docs/development.md` に従い、該当アプリのtypecheck、lint、testと必要な手動確認を検証項目へ含める。
- `Implementation Plan` / Tasksは層の責務と依存方向を守り、必要なコード、テスト、文書更新を分ける。

### 6. デザイン監査FindingをIssue化する

確定Finding由来の場合は、通常手順に加えて次を行う。

1. 元の監査ドキュメントを全文またはFindingを理解するために必要な範囲で読む。
2. Finding IDをIssueタイトルまたは本文から追跡できる形で保持する。
3. 背景またはContextから、監査ドキュメントのリポジトリ相対パスとFinding IDを明記する。
4. 最新の `PRODUCT.md` と `DESIGN.md` を読み、Findingに直接関連する原則を確認する。
5. 関連するプロダクト原則・デザイン原則を、文書パスと章名または原則名でIssue本文から参照する。
6. Findingの観察事実、対象画面・状態・端末・再現条件、ユーザー影響を意味を変えずに保持する。
7. 監査時点の「改善の方向性」は仮説として扱い、確定実装仕様やAcceptance Criteriaへ変換しない。

Acceptance Criteriaには、Findingで確認された問題が解消されたと判断できる条件を書く。実装方法を固定せず、必要ならDesign notesで `Options` / `Recommendation` / `Trade-offs` を整理し、未決の `Decision` は空欄にする。

種別はFindingの性質で決める。例えば、確定仕様からの逸脱はBug、体験の追加・変更はFeature、振る舞い不変の構造改善はRefactor、設計判断だけならDecision、文書・設定中心ならChoreになり得る。

### 7. 関連Issueと文書を扱う

- 前提、後続、重複、同時実施が有効な関連Issueを確認し、`#番号` で相互参照する。
- 長期的に参照する判断は、必要に応じて `docs/decisions/` へのADR昇格を示す。
- ロードマップ上の計画に紐づく場合は、Issue作成後に `docs/roadmap.md` の該当箇所を更新する。
- 監査ドキュメント由来の場合は、Issue作成後に元ドキュメントのIssue対応表または該当FindingへIssue番号・URL・状態を追記する。
- `--draft` ではIssue番号が確定しないため、外部Issueや関連文書は更新せず、必要な更新予定を本文案とともに示す。

### 8. Issueを作成する

本文を一時ファイルへ書き、必ず `gh issue create --body-file` で作成する。長い本文をコマンド引数へ直接埋め込まない。

```bash
gh issue create \
  --title "[Feature] <タイトル>" \
  --label "type:feature" \
  --body-file <一時ファイル>
```

- リポジトリに存在する関連 `phase:N` ラベルが適用できる場合は付与する。
- `--draft` の場合は `gh issue create` を実行せず、タイトル、ラベル、本文案を提示して確認を待つ。
- 作成後はIssue URLを提示する。
- 相互参照と関連文書更新が必要な場合は、Issue番号確定後に行う。

## 完了条件

- 現行テンプレートの見出し、順序、必須項目、固定値に準拠している。
- Issue種別、タイトル接頭辞、ラベルが変更の性質と一致している。
- 設計判断の確定・未確定が `Decision` に正しく反映されている。
- Acceptance Criteriaが実装方法ではなく解消条件を示している。
- 本文が日本語ベースで記載されている。
- Issueが `gh issue create --body-file` で作成されている、または `--draft` で本文案が提示されている。
- 関連Issue、ロードマップ、監査ドキュメントの必要な相互参照が反映されている。
