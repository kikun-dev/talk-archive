---
name: design-audit
description: PRODUCT.md / DESIGN.mdを基準に現行UIを監査し、Product Design Audit、Impeccable Critique、Impeccable Technical Auditを独立実施したうえで、Findingを根本原因単位で統合し監査文書へ残す。「デザイン監査して」「UI監査して」「Product Design Auditして」などで使う。
argument-hint: "[対象フローまたは範囲]"
---

# Design Audit

坂道トーク帖の現行UIを正式なプロダクト・デザイン基盤に照らして監査し、Scope確定から監査文書作成までを一続きに完了する。

コード修正、redesign、polish、Issue作成を監査に混ぜない。Issue化は監査完了後、ユーザーが候補を承認した場合だけ `design-issue` Skillへ引き渡す。

## 入力

- 任意引数: 対象フロー、画面、ルート、または範囲
- 引数省略時: `PRODUCT.md` と実装から、中心成果を代表する主要ユーザーフローを選ぶ

## 実行順序

次の順序を変えない。

1. Scope確定
2. Product Design Audit
3. Impeccable Critique
4. Impeccable Technical Audit
5. Finding統合
6. 優先度再評価
7. Issue化候補の整理
8. 監査ドキュメント作成

## 1. 基準と過去監査を読む

監査開始時に必ず次を読む。

1. `PRODUCT.md`
2. `DESIGN.md`
3. `AGENTS.md`
4. `docs/ai/ai-collaboration.md`

Product Designの保存済み主要ビジュアルリファレンスへアクセスできる場合は、ファイル名だけで判断せず実際の画像を確認する。保存済みの補助デザイン判断も利用可能なら読む。

判断の優先順位を次に固定する。

1. `PRODUCT.md`
2. `DESIGN.md`
3. 正式な主要ビジュアルリファレンス
4. 保存済みの補助デザイン判断
5. 現在の実装と既存UI

現在の実装は監査対象であり、上位の判断基準を上書きしない。

`docs/audits/design/` が存在する場合は過去のデザイン監査を読む。2回目以降は、過去Findingとの対応表を作り、次に区別する。

- 改善済み: 問題が解消され、再現しない
- 残存: 同じ根本原因と影響が継続している
- 再発: 改善済みだった問題が再び確認された
- 新規: 過去監査に同じ根本原因のFindingがない

同じ問題を新規Findingとして重複登録しない。継続できる場合は既存のConsolidated Finding IDを保持する。改善済みFindingは有効なConsolidated Findingsへ混ぜず、Current StrengthsまたはAudit Summaryへ検証結果を記録する。

## 2. Scopeを確定する

引数で範囲が指定されている場合は優先する。指定がなければ、基準文書、現在のルート、実装済み機能を確認し、中心成果を代表する主要フローを選ぶ。

坂道トーク帖では、少なくとも次のProduct Principlesを選定基準にする。

- 記憶を管理より先に置く
- 一件より文脈を大切にする
- 再発見から再体験までを一続きにする
- 静かな個人記録帖である
- 内容を主役にする

Scopeへ次を明記する。

- 対象フロー
- 対象URLまたは起動環境
- 実施日
- Desktop viewport
- Mobile viewport
- 対象テーマ
- 対象ブラウザ
- 認証方法
- 確認方法
- 対象外
- Evidence Limitations

合理的な仮定で確定できる場合は、その仮定をScopeへ記録して前進する。中心成果を評価できない重大な情報不足だけをユーザーへ確認する。利用する監査Skill・ブラウザ・自動化ツール固有の権限、安全、操作ルールにも従う。

## 3. 実画面と証拠を取得する

可能な限りアプリを起動し、対象フローをDesktop / Mobile、対象テーマ、主要状態で実行する。目視だけで正確に判断できない値は測定する。

証拠として次を必要に応じて組み合わせる。

- 実画面とスクリーンショット
- DOM、アクセシブル名、キーボードフォーカス
- computed CSS、element size
- `scrollWidth` / viewport width、contrast ratio
- network / resource size、query count
- コード位置
- Playwrightによる実測
- Impeccable deterministic detector

### 認証

- 認証を迂回しない。
- Google OAuth、自動化検知、認証ガードを偽装・無効化しない。
- 既存の有効な認証状態または既存監査証拠が利用可能か確認する。
- 有効な認証状態がなく主要フローを確認できない場合は、証拠不足を明示し、Product Design Auditを推測で完了扱いにしない。
- 実画面確認が中心監査に不可欠なら、ユーザーへ手動ログインをブロッカーとして依頼する。

### スクリーンショットと私的データ

私的なトーク本文やメディアを含み得るため、監査スクリーンショットを既定でGit管理しない。監査ごとに次の形式の一時ディレクトリを使う。

```text
/tmp/talk-archive-design-audit-YYYY-MM-DD/
```

監査文書には採用した証拠ファイル名と保存場所を記録する。ユーザーの明示指示なしに、私的な本文やメディアを含む証拠をリポジトリへ追加しない。本文を監査文書へ転記する場合も、Findingの理解に必要な最小限へ抑え、可能なら匿名化または要約する。

## 4. 監査中の変更を禁止する

監査開始からConsolidated Findings確定まで、次を変更しない。

- `PRODUCT.md`
- `DESIGN.md`
- UIコード、CSS、デザイントークン、コンポーネント
- テスト
- 監査対象データ

監査中にImpeccableで使用してよいサブコマンドは `critique` と `audit` だけとする。次を実行しない。

- `polish`, `craft`, `shape`, `bolder`, `quieter`, `distill`
- `harden`, `animate`, `colorize`, `typeset`, `layout`, `delight`
- `overdrive`, `clarify`, `adapt`, `optimize`

監査ツールが修正を提案しても適用しない。監査ドキュメントの作成だけを許可する。

## 5. Product Design Auditを実施する

一次監査としてProduct Design Auditを実施する。Product Designプラグインが利用可能なら、既存プロダクトの監査に適したAudit Skill / ワークフローを使う。利用不可の場合は同じ出力契約で実施し、その制限をEvidence Limitationsへ記録する。

Product Design AuditのFindingを後続監査の正解にしない。現行UIを `PRODUCT.md` と `DESIGN.md` に直接照らして評価する。

### Flow Evaluation

対象フローをStep単位に分け、各Stepを次で評価し、証拠に基づく観察要約を付ける。

- 良好
- 概ね良好
- 要改善
- 重大な問題

### Current Strengths

良い点も証拠付きで記録する。次回監査で比較できる具体性を持たせる。

### Findings

IDを `PD-XXX` とし、各Findingへ次を記載する。

- ID
- 優先度: P0 / P1 / P2 / P3
- 対象画面・フロー
- 観察事実
- ユーザーへの影響
- `PRODUCT.md` / `DESIGN.md` との関係
- 改善の方向性
- 根拠となる証拠

「改善の方向性」は検討候補であり、確定仕様、実装要件、IssueのDecisionにしない。

### Design Principles Alignment

`PRODUCT.md` の主要Product Principlesと `DESIGN.md` の主要Design Principlesへの整合度を、根拠とともに評価する。

### Evidence Limitations

確認できなかったこと、推定を含む箇所、検証条件の制限を明記する。

## 6. Impeccable Critiqueを独立実施する

Product Design Audit完了後、Impeccable Skillの `critique` を使う。開始時の主入力は、同じScope、`PRODUCT.md`、`DESIGN.md`、実画面、一次証拠とする。Product Design AuditのFinding一覧や結論をCritiqueの正解として与えず、Critique結果を先に確定してから照合する。

IDを `IMP-C-XXX` とする。

### Design Health Score

次の10項目を各0〜4点で評価し、40点満点とする。各項目へKey Issueを付ける。

1. システム状態の可視性
2. 現実世界との一致
3. ユーザーの制御と自由
4. 一貫性と標準
5. エラー防止
6. 再認優先・記憶負荷削減
7. 柔軟性と効率
8. 美的・最小限のデザイン
9. エラー認識・診断・回復
10. ヘルプと文書

### Critique Findings

各Findingへ次を記載する。

- ID
- 優先度
- 観察事実
- 影響
- 改善方向
- 根拠

### Cognitive Load

次をPass / Failまたは同等の明確な尺度で評価する。

- Single focus
- Grouping
- Chunking
- Visual hierarchy
- Minimal choices
- Working memory
- Progressive disclosure
- One thing at a time

### Emotional Journey

対象フローの期待、安心、迷い、待機、発見、報酬、再探索による負荷を追い、感情曲線を評価する。

### Product Design Auditとの照合

Critique確定後に初めてProduct Design Auditと照合し、次へ分類する。

- 一致
- 再評価
- 追加
- 留保

優先度判断が異なる場合は理由を書く。deterministic detectorが0件でも、UX Findingを否定する証拠にしない。

## 7. Impeccable Technical Auditを独立実施する

Critique完了後、Impeccable Skillの `audit` を使う。Technical Auditの主入力は、同じScope、基準文書、対象コード、実画面、測定証拠とする。Product Design AuditやCritiqueのFindingを正解として渡さず、コードと測定可能な品質から独立して結果を確定する。

IDを `IMP-A-XXX` とする。

### Audit Health Score

次の5 Dimensionを各0〜4点で評価し、20点満点とする。各DimensionへKey Findingを付ける。

1. Accessibility
2. Performance
3. Responsive Design
4. Theming
5. Anti-Patterns

### Technical Findings

各Findingへ次を記載する。

- ID
- 優先度: P0 / P1 / P2 / P3
- Location
- Category
- Impact
- `PRODUCT.md` / `DESIGN.md` との関係
- WCAG / Standard
- Recommendation
- Measured values
- Evidence

値を測定していない場合は推測値を書かず、「未測定」と理由を記載する。

証拠には可能な限り次を組み合わせる。

- 対象コード、コンパイル済みCSS、computed CSS
- Playwright実測、deterministic detector
- コントラスト計算、element size、reflow / `scrollWidth`
- network resource、query count

コードだけで分かる問題を無理に画面Findingへ変換しない。画面だけで観察した問題を、測定なしで数値Findingへ変換しない。

## 8. Findingsを統合し優先度を再評価する

3つの監査結果がそれぞれ確定した後だけ統合する。タイトルの類似ではなく、次がすべて成立するかを確認する。

- 同じ根本原因か
- 同じユーザー影響か
- 同じ改善判断で解消できるか

成立しないFindingは分ける。統合IDを `CF-XXX` とし、既存監査から継続できる場合は既存IDを保持する。

各Consolidated Findingへ次を記載する。

- ID
- 最終優先度
- テーマ
- 状態: 新規 / 残存 / 再発
- 根本原因
- 統合したFinding ID
- Product / UXへの影響
- 技術的根拠
- `PRODUCT.md` / `DESIGN.md` との関係
- 改善の方向性
- 優先度判断

「改善の方向性」は確定仕様にしない。実装方法やコンポーネント構造をDecisionなしに固定しない。

### 優先度基準

- P0: 中心体験が成立しない、重大なアクセシビリティ阻害、回復不能な操作など利用継続を妨げる重大問題
- P1: `PRODUCT.md` の中心成果または主要フローを有意に損なう問題。WCAG 2.2 AAの明確な違反を含む
- P2: 主要体験を改善する重要な問題だが、中心フロー自体は成立する
- P3: 一貫性、コピー、細部の品質改善

元Findingと最終優先度が異なる場合は「優先度判断」で理由を書く。複数監査で重複検出された事実だけで引き上げない。UX上の影響と測定結果が組み合わさり主要フローへの影響が明確になった場合は再評価する。

## 9. Issue化候補を整理する

Consolidated Findingを機械的に一件ずつIssueへ変換しない。次を検討して候補をまとめる。

- 一つの設計判断と実装で同時に解消できるFinding
- 前提Issueと後続Issueへ分けるべきFinding
- redesignまたはDecisionが先に必要なFinding
- 単独のBug / Accessibility fixとして扱えるFinding
- デザイントークンや共通基盤として横断対応すべきFinding

各候補へ次を記載する。

- 仮タイトル
- 対象CF ID
- 推奨Issue種別
- 推奨優先度
- まとめる理由または分割する理由
- 設計判断の要否
- 前提・後続関係

Issueは作成しない。監査完了後に候補をユーザーへ提示し、承認された候補だけを監査文書パス、対象CF ID、グルーピング判断とともに `design-issue` Skillへ渡す。`design-issue` 側で元監査、Finding ID、基準文書を再確認し、Issueテンプレートへ変換する。

## 10. 監査文書を作成する

次へ作成する。

```text
docs/audits/design/NNN-design-audit.md
```

`NNN` は `docs/audits/design/` 内にある数値接頭辞の最大値 + 1とし、3桁でゼロ埋めする。初回は `001`。ディレクトリがなければ作成する。

文書構成を次に固定する。

```markdown
# 坂道トーク帖 Design Audit

## Scope

## Product Design Audit

### Flow Evaluation
### Current Strengths
### Findings
### Design Principles Alignment
### Evidence Limitations

## Impeccable Review

### Critique
#### Design Health Score
#### Findings
#### Cognitive Load
#### Emotional Journey
#### Product Design Auditとの照合

### Technical Audit
#### Audit Health Score
#### Findings
#### Patterns & Systemic Issues
#### Verification Notes

## Consolidated Findings

## Issue化候補

## Audit Summary
```

### Audit Summary

最後に次を要約する。

- Product Design Auditの主要評価
- Design Health Score
- Audit Health Score
- P0 / P1 / P2 / P3のConsolidated Finding件数
- 最優先テーマ
- Evidence Limitations
- 推奨するIssue化順序

## 完了条件

次をすべて満たした場合だけ監査完了とする。

- `PRODUCT.md` と `DESIGN.md` を確認した
- Scopeを明記した
- 主要フローを実画面で確認した。確認不能が中心監査を妨げない範囲ならEvidence Limitationsへ明記し、不可欠なら未完了としてログイン等を依頼した
- Product Design Auditを完了した
- Impeccable Critiqueを独立実施した
- Impeccable Technical Auditを独立実施した
- すべてのFindingに根拠がある
- Consolidated Findingsで重複を根本原因単位に統合した
- 優先度再評価の理由を明記した
- Issue化候補を整理した
- `docs/audits/design/NNN-design-audit.md` を作成した
- コード、`PRODUCT.md`、`DESIGN.md`、監査対象データを変更していない
- Issueを作成していない
