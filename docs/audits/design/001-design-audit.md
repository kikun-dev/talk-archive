# 坂道トーク帖 Design Audit

## Scope

### 監査対象

- 対象フロー: 会話一覧またはグローバル検索から過去の記録を見つけ、会話タイムラインを開き、選択した一件の前後を読んで当時の文脈へ戻る主要再発見フロー
- 対象ステップ:
  1. 会話一覧でグループと会話を選ぶ
  2. 会話タイムラインを開いて本文とメディアを読む
  3. グローバル検索で記憶にある一般語を検索する
  4. 検索結果から一件を選ぶ
  5. 元のタイムライン上の位置へ移動し、前後を読む
- 対象URL: `http://localhost:3000/`、`/search`、`/conversations/{id}`、`/conversations/{id}?recordId={recordId}`
- 実施日: 2026-07-16（Asia/Tokyo）
- Desktop viewport: 1440 × 900 CSS px
- Mobile viewport: 390 × 844 CSS px
- 対象テーマ: ライトテーマ。現行実装に利用可能なダークテーマがないため、ダークは実画面比較の対象外
- 対象ブラウザ: Google Chrome 150.0.7871.124（standalone Playwright MCPを`--browser chrome`で起動）。実画面のUser-Agent Client Hintsでも`Google Chrome 150`を確認した。reduced User-Agent文字列は`Chrome/150.0.0.0`を返す
- 認証方法: ユーザーが事前に手動ログインした既存の認証状態を使用。認証の迂回、ガードの無効化、偽装は行っていない
- 確認方法: Playwright MCPによる実画面遷移、DOM snapshot、スクリーンショット、キーボード操作、computed style、element size、`scrollWidth`、Performance API、console、および対象コードの照合

### Scope選定理由

`PRODUCT.md` の中心成果は「過去に届いた言葉や時間を、思い出として気持ちよく振り返り、そのときの文脈へ戻れること」である。実装済みルートには会話一覧、全文検索、会話タイムライン、会話内検索、日付検索、メディア一覧、作成・編集・インポートがある。そのうち、会話一覧／検索からタイムラインへ戻る再発見フローが、次のProduct Principlesを最も直接に代表するため初回監査のScopeとした。

- 記憶を管理より先に置く
- 一件より文脈を大切にする
- 再発見から再体験までを一続きにする
- 静かな個人記録帖である
- 内容を主役にする

### 対象外

- ログインフローと認証設定
- 会話、レコード、参加者、期間の作成・編集・削除
- JSON / `.eml` インポートの実行
- メディア添付、設定変更、ログアウト
- データ変更を伴う成功・失敗・確認状態
- ライセンス画面
- ダークテーマの実画面比較
- UI修正、コード修正、`PRODUCT.md` / `DESIGN.md` の変更、Issue作成

### Evidence

私的な本文やメディアを含み得るため、スクリーンショットはGit管理せず、次へ一時保存した。

```text
/tmp/talk-archive-design-audit-2026-07-16/
```

採用した証拠:

| ファイル | 証拠内容 |
|---|---|
| `01-home-desktop.png` | Desktop会話一覧 |
| `02-timeline-desktop.png` | Desktop会話タイムラインと常設Composer |
| `03-search-empty-desktop.png` | Desktop検索初期状態 |
| `04-search-results-desktop.png` | Desktop検索結果 |
| `05-search-to-timeline-desktop.png` | Desktop検索結果からタイムラインへ戻った直後 |
| `06-home-mobile.png` | Mobile会話一覧 |
| `07-timeline-mobile.png` | Mobile会話タイムライン |
| `08-mobile-navigation.png` | Mobileナビゲーションドロワー |
| `09-search-results-mobile.png` | Mobile検索結果 |
| `10-search-to-timeline-mobile.png` | Mobile検索結果からタイムラインへ戻った直後 |
| `11-search-to-timeline-mobile-after-5s.png` | 同画面の5秒後 |

正式な主要ビジュアルリファレンスとして、Product Design永続コンテキストの `sakamichi-talk-note-primary-mobile-timeline-quiet-personal-notebook.png` も実画像を確認した。

### Evidence Limitations

- 実データは一会話・一グループを中心とするため、複数会話・複数グループ時の比較性と空状態の網羅性は限定的である。
- ダークテーマは現行実装に切替手段とテーマ実装が確認できず、ライトから推定して合否を出していない。
- データ保護のため、本文やメディアの内容を監査文書へ転記していない。画面上の記録は「会話A」「対象レコード」として扱う。
- 追加・編集・削除・添付・インポートは実行していないため、それらの成功・失敗・回復体験は未評価である。
- スクリーンリーダー実機は使用していない。ARIA、フォーカス、通知はDOM・キーボード操作・コードで確認した範囲である。
- 200%ズーム相当の完全な全画面走査は未実施。390px幅で主要フローの横overflowはないことを実測した。
- Lighthouseや実ネットワーク制限は使用していない。性能値はローカル開発環境のため、絶対的な本番性能ではなく構造上の傾向を示す。

## Product Design Audit

### Flow Evaluation

| Step | 評価 | 観察要約 | 主な証拠 |
|---:|---|---|---|
| 1. 会話一覧から選ぶ | 概ね良好 | グループと会話画像から入口を認識でき、会話カード全体がリンクである。一方、Mobileの3列カードはタイトルが小さく、Desktopは一件が左上へ寄って広い未使用領域を残し、「3034日」は再訪の手掛かりより管理指標に見える。 | `01`, `06`; `GroupedConversationList.tsx`, `ConversationCard.tsx` |
| 2. 会話タイムラインを読む | 要改善 | 本文とメディアは閲覧できるが、吹き出し、反復アバター、小さい本文、日付区切りの欠落により、静かな連続記録面よりチャットに見える。DesktopではComposerが可視高の約29%を占める。 | `02`, `07`; `ChatView.tsx`, `ChatMessage.tsx` |
| 3. グローバル検索する | 概ね良好 | 入力、検索ボタン、結果件数、会話名、日時、種別、抜粋があり、検索自体は成立する。結果は24件の同型カード列で、一致箇所の強調と一致中心の抜粋がない。 | `03`, `04`, `09`; `search/page.tsx`, `SearchResults.tsx` |
| 4. 結果を選び元の位置へ移動 | 重大な問題 | URLには`recordId`が付くが、対象はviewportへ到達せず、ハイライト、しおり、フォーカス、到達通知もない。5秒後も同じ誤った周辺を表示した。 | `05`, `10`, `11`; Playwright実測; `ChatView.tsx:129-173` |
| 5. 前後を読み文脈へ戻る | 要改善 | 周辺記録は同じタイムラインに存在するが、対象を再同定できず、日付区切りもないため、検索結果で見た日時と抜粋を記憶して探し直す必要がある。 | `05`, `10`, `11`; `ChatView.tsx:43-67,365-389` |

### Current Strengths

1. **検索結果を孤立した詳細画面で終わらせていない。** `SearchResults.tsx` は会話IDとレコードIDを保持して元タイムラインへリンクする。経路の骨格は `PRODUCT.md` のRediscovery Modelと一致する。
2. **記録された本文とメディアが感情の源になっている。** 実写真と本文を、背景グラデーション、自動再生、発光、祝祭的モーションで過演出していない。
3. **再発見の入口が複数ある。** グローバル検索、会話内検索、日付検索、メディア一覧が実装されている。Mobileでは通常閲覧時にComposerを非表示にしており、閲覧優先の判断が一部存在する。
4. **基本的な意味と名前がある。** 会話カードはリンク、ヘッダーのアイコン操作にはアクセシブル名があり、video/audioは標準controlsを使って自動再生していない。

### Findings

#### PD-001 — 検索結果から選んだ一件へ到達できず、現在位置も識別できない

- 優先度: P1
- 対象画面・フロー: グローバル検索 → 結果選択 → 会話タイムライン
- 観察事実: 対象レコードはDOMに存在するが、Mobile実測で対象の`top=28312px`、タイムラインの`scrollTop=104374px`となりviewport外に残った。対象には背景、outline、しおり、`tabindex`、ライブ通知がない。5秒後の画面も変わらなかった。
- ユーザーへの影響: 検索結果で見た抜粋と日時を覚え、同じ会話内で目的の一件を再探索しなければならない。再発見から文脈への接続が中心地点で途切れる。
- `PRODUCT.md` / `DESIGN.md` との関係: Core User Outcome、Product Principles 2・3、DESIGN「一件を孤立させない」「現在位置」に不整合。
- 改善の方向性: 大量履歴でも対象へ安定到達できる読込・位置決定方法を設計し、淡い`current-highlight`、短いブランドしおり、到達通知、検索結果へ戻る文脈を組み合わせる。
- 根拠: `05`, `10`, `11`; Playwright DOM実測; `ChatView.tsx:129-173`

#### PD-002 — 日付の節目が表示されず、時間の流れを読み取れない

- 優先度: P1
- 対象画面・フロー: 会話タイムライン
- 観察事実: `groupRecordsByDate` は`dateLabel`を生成するが描画されない。異なる日付が連続しても見出しや区切りがなく、各記録の10pxフル日時へ時間文脈を押し込んでいる。
- ユーザーへの影響: 日跨ぎや時間のまとまりを小さい日時から逐次判断しなければならず、「どのような時間の中にあったか」を取り戻しにくい。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principle 2、DESIGN「日付切り替わり」「投稿時刻」「意味のある時間差」に不整合。
- 改善の方向性: 年月日・曜日の静かな日付区切り、各記録の`HH:mm`、意味のある時間差だけを一段広げる余白を検討する。
- 根拠: `02`, `07`; `ChatView.tsx:43-67,365-389`; `ChatMessage.tsx:340`

#### PD-003 — タイムラインが連続記録面でなくチャット吹き出しとして表現されている

- 優先度: P1
- 対象画面・フロー: 会話タイムライン
- 観察事実: 各記録をアバター、角の欠けた白い吹き出し、影で囲い、本文は14px / 20pxである。正式基準の17px / 1.8と、カードで毎件を囲わない方針を満たさない。
- ユーザーへの影響: 本文よりコンポーネントの反復が目立ち、長時間の日本語閲覧が窮屈になる。非リアルタイムの個人記録帖より現在進行形チャットを想起させる。
- `PRODUCT.md` / `DESIGN.md` との関係: Non-Goals「リアルタイムチャット」、Design Concept、連続面、Timeline Design、Typographyに不整合。
- 改善の方向性: 本文とメディアを同じ読み取り列の連続面へ置き、17px / 1.8、自然なメディア比率、発言者切替時だけの文脈表示を検討する。
- 根拠: `02`, `07`; 主要ビジュアルリファレンス; `ChatMessage.tsx:327-364`

#### PD-004 — Desktop閲覧中もComposerが常設され、管理操作が内容より強い

- 優先度: P2
- 対象画面・フロー: Desktop会話タイムライン
- 観察事実: 640px以上でComposerを常時表示し、900px高の画面で約265px（約29%）を占める。4タブ、日時、タイトル、本文、追加ボタンが検索から戻った直後にも見える。
- ユーザーへの影響: 過去の言葉を読む途中で追加操作が視線と面積を奪い、「読む」と「記録する」のモードが混ざる。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principles 1・5・7、Reading vs Management Modesに不整合。
- 改善の方向性: Desktopも閲覧状態を既定とし、明示的な「記録を追加」または管理モードから段階的にComposerを開く方向を検討する。
- 根拠: `02`, `05`; `ChatView.tsx:394-403`

#### PD-005 — Mobileナビゲーションが二重化し、読書面と操作所属を圧迫する

- 優先度: P2
- 対象画面・フロー: Mobile会話一覧・タイムライン・ドロワー
- 観察事実: ロゴ＋ハンバーガーの共通ヘッダーと、戻る＋会話名＋検索＋三点メニューの会話ヘッダーが二段になる。上部約122pxを占め、ハンバーガーと三点メニューの役割が近接する。
- ユーザーへの影響: 内容の可視量が減り、どちらのメニューが会話とプロダクト全体を操作するか判断負荷が増える。
- `PRODUCT.md` / `DESIGN.md` との関係: Device and Task Model、Responsive Design、Mobile Navigationに不整合。
- 改善の方向性: 会話閲覧時のMobileヘッダーを「戻る／会話名／検索／補助メニュー」の一段へ統合し、グローバル操作の到達方法を整理する。
- 根拠: `07`, `08`, `10`; `Sidebar.tsx:94-140`; `ChatView.tsx:178-297`

#### PD-006 — 検索結果がカードの壁になり、一致理由を走査しにくい

- 優先度: P2
- 対象画面・フロー: Desktop / Mobileグローバル検索結果
- 観察事実: 24件を同型の枠付きカードで表示し、一致語の強調と一致箇所中心の抜粋がない。Desktopの長文スニペットは広い一行へ伸びる。
- ユーザーへの影響: 各カード本文を読み比べる必要があり、目的記録を選ぶまでの比較負荷が高い。
- `PRODUCT.md` / `DESIGN.md` との関係: 再発見モデル、連続面、検索結果の空状態・読み取り幅に部分不整合。
- 改善の方向性: 枠を減らした連続リスト、一致箇所中心の抜粋、控えめな検索語強調、一貫したメタ行を検討する。
- 根拠: `04`, `09`; `SearchResults.tsx:40-76`

#### PD-007 — 正式なデザイン基盤が実画面へ反映されず、汎用gray UIに留まる

- 優先度: P2
- 対象画面・フロー: Scope全体
- 観察事実: bodyはArial / Helvetica、白・黒とTailwindの`gray-*`を中心に構成される。Noto Sans JP、閲覧面、セマンティックカラー、ブランドアクセント、ダークテーマが反映されていない。
- ユーザーへの影響: 露骨な装飾ノイズはないが、「余白で読む、静かな個人記録帖」固有の読み心地と一貫性が生まれず、実装途中の管理UIに見える。
- `PRODUCT.md` / `DESIGN.md` との関係: Design Concept、Color and Themes、Typography、Design Tokensに不整合。
- 改善の方向性: セマンティックトークンを共通入口としてライト／ダークを対で実装し、Noto Sans JPと読み取り幅・面・境界の役割を適用する。
- 根拠: `01`〜`10`; `src/app/globals.css:3-18`; detector `design-system-font`

### Design Principles Alignment

| Principle | 整合度 | 根拠 |
|---|---|---|
| 記憶を管理より先に置く | 要改善 | MobileではComposerを隠すが、Desktopでは約29%を管理UIが占める。 |
| 一件より文脈を大切にする | 重大な不整合 | 選択した一件へ到達できず、日付区切りもない。 |
| 再発見から再体験までを一続きにする | 重大な不整合 | URL設計は正しいが、到達位置と現在位置表現が失敗する。 |
| 静かな個人記録帖である | 要改善 | 装飾は静かだが、吹き出しと汎用gray UIがチャット／管理画面を想起させる。 |
| 内容を主役にする | 要改善 | 実メディアは主役になり得るが、本文14px、反復カード、Desktop Composerが競合する。 |
| 元の環境から独立して残す | 概ね良好 | 認証済みアーカイブ内でテキストとメディアを閲覧できる。長期蓄積時の表示性能は要改善。 |
| 端末ごとの役割を尊重する | 概ね良好 | MobileはComposerを隠すが、二重ヘッダーと小さい操作領域が残る。 |
| 利用環境が変わっても中心体験を保つ | 未達 | ダークテーマが実装されておらず比較不能。 |

### Evidence Limitations

Scope節の制約に加え、Product Design Auditではスクリーンショットから完全なWCAG適合を主張していない。コントラスト、ターゲット寸法、フォーカス、性能は後続Technical Auditの実測結果へ分離した。

## Impeccable Review

### Critique

Method: dual-agent (A: `/root/impeccable_assessment_a` · B: `/root/impeccable_assessment_b`)

Assessment AはProduct Design Auditとdetectorを見ずにデザイン評価を確定した。Assessment BはAssessment Aと監査Findingを見ずにdetector・コード・測定証拠を確定した。親エージェントはAを先に読み、その後にBを照合した。

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---:|---|---:|---|
| 1 | システム状態の可視性 | 2/4 | 件数は分かるが、検索到達点、現在ナビゲーション、移動完了が伝わらない。 |
| 2 | 現実世界との一致 | 2/4 | 日本語と時系列は自然だが、吹き出しが過去記録よりリアルタイムチャットを示唆する。 |
| 3 | ユーザーの制御と自由 | 2/4 | 会話ヘッダーの戻るは検索元でなく常に一覧へ行き、overlayのEscapeも不十分。 |
| 4 | 一貫性と標準 | 2/4 | 基本要素は標準的だが、二重ヘッダー、active state、正式トークンとの乖離がある。 |
| 5 | エラー防止 | 2/4 | 閲覧面に追加フォームを常設し、読む／管理するモード分離が弱い。 |
| 6 | 再認優先・記憶負荷削減 | 1/4 | 到達点と日付区切りがなく、検索結果の抜粋と日時を覚えて探し直す。 |
| 7 | 柔軟性と効率 | 2/4 | 複数検索入口はあるが、安定した到達、絞り込み、強調、アクセラレータがない。 |
| 8 | 美的・最小限のデザイン | 2/4 | 装飾は少ないが、吹き出し、カード、Composer、二重ヘッダーが内容と競合する。 |
| 9 | エラー認識・診断・回復 | 1/4 | 一致なしは分かるが、到達失敗、条件変更、検索へ戻る回復が示されない。 |
| 10 | ヘルプと文書 | 0/4 | グローバル検索と会話内検索の範囲、再発見導線の文脈ヘルプがない。 |
| **Total** |  | **16/40** | **Poor** |

#### Findings

##### IMP-C-001 — 再発見後の到達点が見つからない

- 優先度: P1
- 観察事実: 結果選択後に対象がviewport外へ残り、ハイライトと通知もない。
- 影響: 中心成果が検索結果選択直後で途切れ、記憶負荷が最大化する。
- 改善方向: 安定した位置決定、静かな現在位置、到達通知、検索へ戻る文脈を一体で検討する。
- 根拠: `05`, `10`, `11`; Playwright実測

##### IMP-C-002 — 時間のまとまりを外部化できていない

- 優先度: P1
- 観察事実: 日付見出しがなく、全記録で小さいフル日時を繰り返す。
- 影響: 利用者が日跨ぎと時間差を作業記憶で検出する。
- 改善方向: 日付区切り、時刻、意味のある時間差を静かな階層として設計する。
- 根拠: `02`, `07`; `ChatView.tsx`

##### IMP-C-003 — 閲覧と記録追加が同時に主張する

- 優先度: P2
- 観察事実: DesktopでComposerが常設される。
- 影響: 過去を読む心理的安全と集中を損なう。
- 改善方向: 閲覧を既定にし、追加を明示的モードへ段階開示する。
- 根拠: `02`, `05`

##### IMP-C-004 — 汎用チャットの文法が個人記録帖の性格を上書きする

- 優先度: P1
- 観察事実: アバター、吹き出し、影、14px本文を全件へ反復する。
- 影響: 内容よりUI構造が目立ち、非リアルタイムの記録という意味が弱くなる。
- 改善方向: 連続面、本文優先の文字、メディアと本文の同一時間軸へ再構成する。
- 根拠: `02`, `07`; 主要ビジュアルリファレンス

##### IMP-C-005 — Mobileシェルが操作所属と読書面を奪う

- 優先度: P2
- 観察事実: 二段ヘッダーと近接する二種類のメニューがある。
- 影響: 内容の可視量と片手操作性を損なう。
- 改善方向: 会話中のMobileヘッダーを一段へ統合し、グローバル操作と会話操作の所属を整理する。
- 根拠: `07`, `08`, `10`

##### IMP-C-006 — 検索結果が一致理由よりカード反復を見せる

- 優先度: P2
- 観察事実: 同型カード24件、一致強調なし、Desktopの長い行長。
- 影響: 比較・走査負荷が高い。
- 改善方向: 連続リスト、一致中心抜粋、軽いグルーピングを検討する。
- 根拠: `04`, `09`

#### Cognitive Load

| Check | 判定 | 根拠 |
|---|---|---|
| Single focus | Fail | Desktopの本文とComposerが同時に主張する。 |
| Grouping | Pass | 各結果と各記録内のメタ・本文・メディアは近接している。 |
| Chunking | Fail | 日付見出しがなく、検索結果24件も平坦に連なる。 |
| Visual hierarchy | Fail | 本文14pxに対しComposerは全幅。到達対象の優先度はない。 |
| Minimal choices | Fail | 会話メニューで探索・閲覧・管理の5項目を同階層に置く。 |
| Working memory | Fail | 結果の日時・抜粋を記憶して到達先で再探索する。 |
| Progressive disclosure | Fail | Desktopの追加フォーム一式を通常閲覧へ常設する。 |
| One thing at a time | Fail | 読む／探す／追加する操作が同時に見える。 |

8項目中7項目がFailであり、認知負荷は高い。主因はデータ量そのものではなく、現在位置・時間構造・モードをUIが外部化していないことである。

#### Emotional Journey

| 段階 | 感情 | 評価 |
|---|---|---|
| 会話一覧 | 親しみ・期待 | 実写真とロゴは個人的だが、一件が左上へ寄る構図は未完成感がある。 |
| タイムラインを開く | 発見・親密さ | 本文と写真が感情のピークを作る一方、吹き出しとComposerが管理／チャットへ引き戻す。 |
| 検索する | 安心から疲労へ | 件数表示は安心だが、同型カードと一致強調不足で走査疲れが増える。 |
| 結果を選ぶ | 最大の谷 | 到着点が見えず、正しく移動した確信を得られない。 |
| 前後を読む | 報酬が弱い | 周囲の記録はあるが日付の節目と検索への復帰がなく、迷った状態で終わる。 |

Peak-End Ruleでは、内容自体が作るピークはあるが、検索到達後のendが弱い。

#### Product Design Auditとの照合

| Critique | 分類 | Product Design Auditとの関係 |
|---|---|---|
| IMP-C-001 | 一致 | PD-001と同じ根本原因・影響。 |
| IMP-C-002 | 一致 | PD-002と同じ時間文脈不足。 |
| IMP-C-003 | 一致 | PD-004と同じ閲覧／管理モード未分離。 |
| IMP-C-004 | 一致 | PD-003と同じチャット文法・本文階層。 |
| IMP-C-005 | 一致 | PD-005をMobileの認知負荷として再確認。 |
| IMP-C-006 | 一致 | PD-006を走査・比較負荷として再確認。 |
| ヘルプ0/4 | 留保 | 単一ユーザーの個人ツールであり、独立P1にはせず、検索範囲と復帰文脈のコピー改善へ含める。 |
| detector側B-1 P0 | 再評価 | 検索起点は中心フローを壊すが、会話一覧からの閲覧は成立するため、全体優先度はP1とする。 |

Questions skipped: 問題の根本原因と優先順が基準文書・実測から明確であり、ユーザーは監査完了のみを依頼しているため。実装判断はIssue化後のDecisionへ残す。

### Technical Audit

#### Audit Health Score

| # | Dimension | Score | Key Finding |
|---:|---|---:|---|
| 1 | Accessibility | 1/4 | 検索到達通知、dialogのfocus order・keyboard dismiss、入力label・contrastに重大な不足がある。 |
| 2 | Performance | 1/4 | 326件の全レコードがDOMへ存在し3475要素となる。画像network loadは未測定だが、長期履歴に対する描画上限がない。 |
| 3 | Responsive Design | 2/4 | 390pxで横overflowはないが、二段ヘッダーとDESIGNの44px基準未満の20px／38px操作面が残る。 |
| 4 | Theming | 0/4 | セマンティックトークンとダークテーマがなく、544箇所の生Tailwind palette利用。 |
| 5 | Anti-Patterns | 1/4 | Timelineの吹き出し／影とSearch Resultsのカード反復が、別々の中心画面へ構造化されている。 |
| **Total** |  | **5/20** | **Critical** |

#### Findings

##### IMP-A-001 — 検索到達の位置決定と支援技術通知が機能しない

- 優先度: P1
- Location: `src/components/ChatView.tsx:129-173`, `src/components/SearchResults.tsx:43-45`
- Category: Accessibility / Performance
- Impact: 選択した記録がviewportへ入らず、視覚・支援技術の双方で中心タスクを完了できない。
- `PRODUCT.md` / `DESIGN.md` との関係: Rediscovery Model、現在位置、フォーカスと到達通知に不整合。
- WCAG / Standard: WCAG 2.4.3 Focus Order、4.1.3 Status Messagesに関連。DESIGN「検索結果から現在位置への移動と支援技術への通知」。
- Recommendation: targetの存在確認だけで完了扱いにせず、viewport到達の検証、必要な再試行または位置補正、状態面、フォーカス／ライブ通知を一体で設計する。
- Measured values: 対象`top=28312px`; timeline `scrollTop=104374px`; targetはtransparent、outlineなし、`aria-live`なし、`tabindex`なし。
- Evidence: Playwright DOM; `05`, `10`, `11`
- Failure mechanism: 対象がviewport外へ残ること、単発の`scrollIntoView({ behavior: "smooth" })`だけで成功確認・到達状態保持がないことは確認済み。全件DOM、scroll container、画像状態のどれが直接の失敗原因かは未確定であり、単発smooth scrollだけを確定原因とはしない。

##### IMP-A-002 — Mobile dialogがfocus orderとkeyboard dismissを満たさない

- 優先度: P1
- Location: `src/components/Sidebar.tsx:94-140`
- Category: Accessibility
- Impact: `aria-modal="true"`の表示中もフォーカスが背景へ移り、キーボード利用者は現在の操作範囲と閉じ方を見失う。
- `PRODUCT.md` / `DESIGN.md` との関係: Mobile Navigation、Focus Management、Accessibilityに不整合。
- WCAG / Standard: 背景へ抜けるfocus orderはWCAG 2.4.3、overlayに隠れた背景の戻るリンクへfocusする事実は2.4.11 Focus Not Obscured (Minimum)に不整合。open後もnative toggle buttonがfocusを保持するため、初期位置ではEnter／Spaceによる再操作が可能であり、2.1.1 Keyboard違反は確認していない。Escapeで閉じないこととmodal内close buttonがないことは、単独のWCAG違反ではなくWAI-ARIA APG Modal Dialog Patternとの差として扱う。
- Recommendation: open時focus移動、modal内の循環、明示的close button、keyboard dismiss、close後の起点復帰を共通overlay contractにする。
- Measured values: open直後もfocusは背景の起点button。Tab 1〜5はdialog内、Tab 6で背景の戻るリンク、Tab 7で背景の検索buttonへ移動。Escape後もopen。close button 0件。
- Evidence: Playwright keyboard/DOM; `08`

##### IMP-A-003 — Mobile icon controlがプロジェクトの44px操作面基準を満たさない

- 優先度: P2
- Location: `src/components/Sidebar.tsx:94-118`; `src/components/ChatView.tsx:178-238`
- Category: Accessibility / Responsive
- Impact: DESIGN.mdが想定する片手操作の余裕を満たさず、誤タップ耐性が弱い。
- `PRODUCT.md` / `DESIGN.md` との関係: DESIGN「主要操作44×44 CSS px以上」に不整合。
- WCAG / Standard: WCAG 2.5.8 Target Size (Minimum)の基準は24×24 CSS pxまたはspacing exception。38×38pxのグローバルmenuはサイズ基準を満たす。20×20pxの戻る／検索／メニューは24px未満だが、検索とメニューの中心間距離は約28.2pxで24pxのspacing circleが交差せず、戻るも隣接targetから離れているため、今回測定した要素ではspacing exceptionにより2.5.8違反を確認していない。
- Recommendation: WCAG合否とは分けて、プロジェクト基準としてclickable target自体を44×44px以上にする。
- Measured values: 戻る／検索／メニューのclickable target各20×20px。検索中心(340, 95.625)、メニュー中心(368, 92.125)、中心間約28.2px、要素間horizontal gap 8px。グローバルmenu 38×38px、内部SVG 20×20px。
- Evidence: Playwright `getBoundingClientRect`; target間距離再測定

##### IMP-A-004 — Timeline本文とmetadataが読書用type rampを満たさない

- 優先度: P1
- Location: `src/components/ChatMessage.tsx:340-355`
- Category: Accessibility / Typography
- Impact: 長い日本語本文と時間文脈が読みづらく、内容より小さい文字を解読する負荷が増える。
- `PRODUCT.md` / `DESIGN.md` との関係: body-reading 17px / 1.8、metadata 12px下限に不整合。
- WCAG / Standard: 文字サイズだけを直接のWCAG違反とはしない。DESIGNの読書性基準と、200% zoom / reflowを含む検証対象として扱う。
- Recommendation: Timeline本文とmetadataへ正式type rampを適用し、行長・行間・zoom時のreflowを再検証する。
- Measured values: 本文14px / 20px、metadata 10px。detectorがScope内の10pxを検出。
- Evidence: computed CSS; detector `design-system-font-size`; `02`, `07`

##### IMP-A-005 — 検索inputのlabel・文字contrast・control boundaryが不足する

- 優先度: P1
- Location: `src/app/(app)/search/page.tsx:33-49`; `src/components/ChatView.tsx:315-349`
- Category: Accessibility / Controls
- Impact: 入力目的、placeholder、入力境界、状態文字が低視力・支援技術利用で識別しにくい。
- `PRODUCT.md` / `DESIGN.md` との関係: visible label、control border 3:1、interaction statesに不整合。
- WCAG / Standard: visible／accessible labelの不足は3.3.2 Labels or Instructions、placeholder相当の3.41:1と`gray-400`文字2.54:1は1.4.3 Contrast (Minimum)、識別に必要なinput border 1.47:1は1.4.11 Non-text Contrastに不整合。
- Recommendation: placeholderに依存しないlabel、semantic text/control-border tokens、明確なfocus-visibleを共通control contractにする。
- Measured values: グローバル検索input 14px・38px高、button 14px・36px高、visible/associated label 0件。`gray-400`/white 2.54:1、input border `gray-300`/white 1.47:1、placeholder相当/white 3.41:1。
- Evidence: computed CSS; contrast計算; DOM/source

##### IMP-A-006 — 長期アーカイブの全レコードが同時にDOMへ存在する

- 優先度: P1
- Location: `src/repositories/recordRepository.ts:41-56`; `src/usecases/conversationUseCases.ts:274-293`; `src/components/ChatView.tsx:69-90,365-389`
- Category: Performance
- Impact: 記録増加に応じてSSR payload、hydration、DOM、ローカル検索の処理量に上限がなく、長期保存という製品目的ほど操作安定性のリスクが高まる。
- `PRODUCT.md` / `DESIGN.md` との関係: 長期保存・継続再訪、メディア読み込み時の安定性に不整合。
- WCAG / Standard: 性能標準。直接のWCAG違反ではないが、中心フローの操作可能性へ影響する。
- Recommendation: 検索anchorと前後文脈を保てるpagination / windowing / 日付単位読込の方式をDecisionとして比較する。
- Measured values: 326 recordsすべてがDOMに存在し、3475 DOM elements。628 `img` elementsが存在し、測定時に`complete === false`は201要素。`complete === false`はlazy-loading、未着手、失敗などを区別しないため、network loadや性能劣化の件数とは扱わない。network request数・転送bytesは未測定。
- Evidence: Playwright DOM; repository/usecase/renderコード

##### IMP-A-007 — セマンティックトークンとダークテーマが実装されていない

- 優先度: P2
- Location: `src/app/globals.css:3-18`; Scope内の`src/app/(app)`と`src/components`
- Category: Theming
- Impact: DESIGNの情報階層とブランド希少性を一貫して適用できず、ダーク環境で中心体験を検証できない。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principle 10、Color and Themes、Design Tokensに不整合。
- WCAG / Standard: ライト／ダーク個別contrast測定要件。
- Recommendation: DESIGN frontmatterをsemantic aliasへ実装し、コンポーネントは生paletteでなく役割トークンを使う。
- Measured values: `color-scheme: normal`; `dark:`利用0件; raw Tailwind palette利用544件; body Arial。detector `overused-font` 1、`design-system-font` 1。
- Evidence: `rg`; computed CSS; detector

##### IMP-A-008 — Mobileのレスポンシブ変更が構造整理でなくヘッダー追加になっている

- 優先度: P2
- Location: `src/components/Sidebar.tsx:94-140`; `src/components/ChatView.tsx:178-297`
- Category: Responsive Design
- Impact: 画面幅は収まるが、読書面と操作所属を損なう。
- `PRODUCT.md` / `DESIGN.md` との関係: compact headerとMobile Navigationに不整合。
- WCAG / Standard: Reflow観点。横overflowは合格。
- Recommendation: 会話中のヘッダーを一段へ統合し、現在位置と戻り先を維持する構造へ変える。
- Measured values: viewport/scrollWidth/clientWidth = 390/390/390。二段ヘッダー約122px。
- Evidence: `07`, `10`; Playwright DOM

##### IMP-A-009 — smooth scrollにreduced-motion代替がない

- 優先度: P2
- Location: `src/components/ChatView.tsx:134`; `src/app/globals.css`
- Category: Accessibility / Motion
- Impact: interaction起点の長距離smooth scrollを止める選択がなく、長い履歴では位置認識を悪化させる。
- `PRODUCT.md` / `DESIGN.md` との関係: Motion、`prefers-reduced-motion`要件に不整合。
- WCAG / Standard: WCAG 2.3.3 Animation from Interactions（AAA）、DESIGN必須要件。
- Recommendation: reduced時は即時scroll、通常時も大距離移動のdurationと到着状態を制御する。
- Measured values: `behavior: "smooth"` 1件; `prefers-reduced-motion`実装0件。
- Evidence: `rg`; `ChatView.tsx`

##### IMP-A-010 — Timelineがbubbleとshadowを全記録へ反復する

- 優先度: P2
- Location: `src/components/ChatMessage.tsx:327-364`
- Category: Anti-Patterns
- Impact: 個人記録帖が汎用チャットに見え、本文とメディアの時間的連続性を弱める。
- `PRODUCT.md` / `DESIGN.md` との関係: Anti-Patterns「吹き出し」「各件を独立カード化」「枠と影」に不整合。
- WCAG / Standard: デザイン標準。直接のWCAG違反ではない。
- Recommendation: Timelineを連続した読み取り面へ移し、発言者切替と意味のある時間差だけを構造化する。
- Measured values: message bubble `border-radius: 0 8px 8px`, `shadow-sm`。
- Evidence: computed CSS; `02`, `07`; source

##### IMP-A-011 — Search Resultsがborder付きcardを全件へ反復する

- 優先度: P2
- Location: `src/components/SearchResults.tsx:40-76`
- Category: Anti-Patterns
- Impact: 一致理由と結果比較より枠の反復が目立ち、24件のscanabilityを下げる。
- `PRODUCT.md` / `DESIGN.md` との関係: Rediscovery Model、連続面、カード乱用禁止に不整合。
- WCAG / Standard: デザイン標準。直接のWCAG違反ではない。
- Recommendation: 一致中心の抜粋、控えめな語強調、連続リスト、制御した行長へ整理する。
- Measured values: SearchResultsの全結果が`rounded-lg border`; 実画面24件。
- Evidence: `04`, `09`; source

#### Patterns & Systemic Issues

1. **正式なDesign Foundationと実装の間に共通入口がない。** 544件の生palette、Arial、個別のtext size・radius・shadowが、a11y、theming、ブランド、整合性のFindingを同時に生む。
2. **長期アーカイブの全レコードを同時にDOMへ置く。** 表示性能、対象anchor、ローカル検索が同じ構造上の上限へ当たっている。画像network loadは未測定であり、この構造から転送量を断定しない。
3. **閲覧／探索／管理のモード契約がコンポーネント境界へ反映されていない。** Composer、overflow menu、Mobile shellが内容と競合する。
4. **overlayとicon controlの共通a11y contractがない。** Focus order、keyboard dismiss、return focus、プロジェクト独自の44px基準が画面ごとの実装に委ねられる。WCAG 2.5.8の24px／spacing exceptionとは分けて判定する。
5. detectorは19件（warning 9 / advisory 10）。Scope内で有効なのはArial/Design fontと10px type。`side-tab` 7件は真陽性だが、インポート画面でScope外のため今回のConsolidated Findingsへ含めない。

#### Verification Notes

- Browser provenance: standalone Playwright MCPは`--browser chrome`で起動され、監査環境のGoogle Chrome 150.0.7871.124を使用した。再確認時のUser-Agent Client Hintsは`Google Chrome 150`と`Chromium 150`、reduced User-Agentは`Chrome/150.0.0.0`を返したため、Scopeの旧表記「Chromium」を「Google Chrome 150.0.7871.124」へ補正した。
- Impeccable Critique: `.agents/skills/impeccable/SKILL.md`と`reference/critique.md`のworkflowを使用した。ユーザー承認後、`/root/impeccable_assessment_a`と`/root/impeccable_assessment_b`を別sub-agentとして起動したdual-agent実行である。Assessment AはPRODUCT/DESIGN・実画面・一次証拠からデザイン評価、Nielsen 10項目、Cognitive Load、Emotional Journeyを行い、Product Design Audit Finding、detector、Assessment Bを参照しなかった。Assessment BはAを参照せず、detectorとbrowser evidenceを担当した。Aの結果を親が受領した後にBのdetector結果を受領し、両方の確定後に親がCritiqueへ統合した。
- Impeccable detector: `node .agents/skills/impeccable/scripts/detect.mjs --json src/app src/components` をAssessment Bが1回実行。exit 2、19件。
- Impeccable Technical Audit: Critique統合後、親監査が`.agents/skills/impeccable/reference/audit.md`のweb workflowを別工程として使用し、Accessibility / Performance / Responsive Design / Theming / Anti-Patternsの5 Dimensionを対象コード、認証済み実画面、computed style、DOM、contrast、detectorから評価した。Assessment BはCritiqueの一部であり、Technical Auditそのものではない。Technical Audit用の追加sub-agentは使っていない。Critique Findingを正解として再掲せず、技術証拠からFindingを確定してからConsolidated Findingsで照合した。detectorはCritique Bの有効な1回分を再利用し、親では再実行していない。
- overlay injection: ユーザーのUI変更禁止に従いスキップ。ユーザーに見えるoverlayは存在しない。live serverも起動していない。
- Assessment A/Bの新規認証タブ: 認証Playwright profileが使用中で作成できなかった。親監査の認証済みPlaywright実画面とcurrent-run PNGを共通の生証拠として利用し、Findingは独立確定した。
- CLI detectorと親のcomputed/DOM値を照合し、detectorだけでUX Findingを否定または昇格していない。
- WCAG再測定: 20×20pxは内部SVGでなくclickable target自体の寸法だった。38×38pxはWCAG 2.5.8の24pxを満たし、20×20pxの3要素も今回測定したspacingではexceptionを満たすため、2.5.8違反とは判定しない。44×44px未満はDESIGN.md独自基準との不整合として維持する。Escape非対応はAPGとの差とし、native openerのkeyboard再操作が可能なため2.1.1違反は確認していない。focus orderと隠れた背景へのfocusを2.4.3／2.4.11へ対応付けた。
- Health Score rating bands: `reference/critique.md`は12–19点を`Poor`、`reference/audit.md`は0–5点を`Critical`と明示している。したがって16/40（Poor）と5/20（Critical）のラベルは正式なImpeccable基準に基づき維持する。
- Performance evidence: 326 records、628 `img` elements、201 `complete === false`、3475 DOM elementsを区別する。全326 recordsがDOMに存在する構造は確認済み。201件はnetwork request中または性能劣化を意味しない。network request数・転送bytesは未測定。検索到達失敗の直接mechanismも未確定として扱う。
- critique snapshot persistence: 親`design-audit`の単一監査文書だけを永続化し、ユーザーが禁止した追加成果物を避けるため`.impeccable/critique`への別snapshotは作成していない。trendも未読。

## Consolidated Findings

### CF-001 — 検索から対象レコードと前後文脈へ安定到達できない

- 最終優先度: P1
- テーマ: Rediscovery / Current Position
- 状態: 新規
- 根本原因: `scrollIntoView`呼出後にviewport到達を検証・回復する契約がなく、到達成功、現在位置、focus、支援技術通知を状態として保持していない。
- 統合したFinding ID: PD-001, IMP-C-001, IMP-A-001
- Product / UXへの影響: Core User Outcomeの「見つけた一件から前後を読み文脈へ戻る」が検索起点で成立しない。
- 技術的根拠: 対象`top=28312px`、timeline `scrollTop=104374px`、target state/notificationなし、5秒後も同画面。全件DOMと長大なscroll containerは寄与要因の候補だが、単発smooth scrollが失敗する直接mechanismは未確定。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principles 2・3、DESIGN「現在位置」「一件を孤立させない」。
- 改善の方向性: 長期履歴のanchor設計を先に決め、位置決定、視覚強調、状態通知、検索への復帰を一つの体験として設計する。
- 優先度判断: detector側P0からP1へ変更。検索起点の中心フローを有意に損なうが、会話一覧から通常閲覧する経路は成立するため、プロダクト全体が完全に利用不能ではない。

### CF-002 — 日付と時間差がタイムラインの構造として現れない

- 最終優先度: P1
- テーマ: Temporal Context
- 状態: 新規
- 根本原因: 日付グループをデータ上で作る一方、表示層では日付見出しを捨て、各記録の小さいフル日時だけへ文脈を委ねている。
- 統合したFinding ID: PD-002, IMP-C-002
- Product / UXへの影響: 前後の出来事が「どの時間の中にあったか」を読み直せず、一件より文脈を大切にする成果が弱い。
- 技術的根拠: `dateLabel`未描画、metadata 10px、日跨ぎでも区切りなし。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principle 2、Timeline Design。
- 改善の方向性: 日付区切り、時刻、意味のある時間差を、強い縦軸を使わず余白と文字で構成する。
- 優先度判断: 3監査の重複ではなく、中心成果へ直接影響するためP1。

### CF-003 — 中心閲覧面に読書用typographyと連続面の契約がない

- 最終優先度: P1
- テーマ: Reading Surface
- 状態: 新規
- 根本原因: 既存のChat UIモデルを中心閲覧面へ流用し、正式なreading type ramp・連続面・メディア階層へ移行していない。
- 統合したFinding ID: PD-003, IMP-C-004, IMP-A-004, IMP-A-010
- Product / UXへの影響: 記録の内容より吹き出しとアバターが目立ち、長時間の日本語閲覧と非リアルタイム性を損なう。
- 技術的根拠: 本文14px / 20px、bubble、shadow、各件カード化。
- `PRODUCT.md` / `DESIGN.md` との関係: Non-Goals、Design Concept、Typography、Timeline Design、Anti-Patterns。
- 改善の方向性: 連続した読み取り列、17px / 1.8、発言者切替と時間差だけの文脈、自然なメディア比率へ再設計する。
- 優先度判断: 見た目の好みではなく中心閲覧の可読性と意味を損なうためP1。

### CF-004 — Desktopの閲覧状態と記録・管理状態が分離されていない

- 最終優先度: P2
- テーマ: Mode Clarity
- 状態: 新規
- 根本原因: Desktop幅を理由にComposerを常設し、画面の主目的に応じて操作強度を切り替えるモード契約がない。
- 統合したFinding ID: PD-004, IMP-C-003
- Product / UXへの影響: 過去を読む画面で追加操作が約29%を占め、内容への集中と誤操作への心理的安心を損なう。
- 技術的根拠: `hidden sm:block`; Desktop証拠でComposer約265px。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principles 1・5・7、Reading vs Management Modes。
- 改善の方向性: 閲覧を既定とし、追加・編集・インポートを明示的モードまたは段階開示へ移す。
- 優先度判断: Composerが約29%を占める観察事実と心理的・面積的競合は重要である。一方、タイムライン本文は閲覧でき、中心フロー自体は成立し、明確なWCAG AA違反・回復不能操作ではないため、design-audit基準のP2へ変更した。CF-002・CF-003は時間文脈と中心読書面を直接損なうため独立してP1を維持する。

### CF-005 — Mobileでglobal shellとconversation shellが二重化する

- 最終優先度: P2
- テーマ: Mobile Shell / Responsive Navigation
- 状態: 新規
- 根本原因: global shellとconversation shellがそれぞれcompact headerを持ち、会話閲覧時に一段へ統合するresponsive構造がない。
- 統合したFinding ID: PD-005, IMP-C-005, IMP-A-008
- Product / UXへの影響: 二段ヘッダーが読書面を約122px使用し、ハンバーガーと三点メニューの操作所属を判断しにくい。
- 技術的根拠: 390px幅で横overflowはない一方、上部二段ヘッダーは約122px。
- `PRODUCT.md` / `DESIGN.md` との関係: Device and Task Model、Mobile Navigation、Accessibility。
- 改善の方向性: 会話中のglobal操作とconversation操作を一段のcompact headerへ整理する。
- 優先度判断: 内容の可視量と認知負荷を損なうが、横overflowはなく中心フローは成立する。Accessibility contractはCF-006へ分離し、本FindingはP2とする。

### CF-006 — Mobile overlayとicon controlに共通accessibility contractがない

- 最終優先度: P1
- テーマ: Overlay / Keyboard / Target Contract
- 状態: 新規
- 根本原因: modal focus lifecycle、keyboard dismiss、icon controlの操作面を共通化するnavigation interaction contractがない。
- 統合したFinding ID: IMP-A-002, IMP-A-003
- Product / UXへの影響: キーボード利用者がmodalと背景の境界・閉じ方を見失い、Mobile利用者はプロジェクト基準未満の操作面を使う。
- 技術的根拠: open時focus移動なし、Tab 6でoverlayに隠れた背景へfocus、Escapeでは閉じない、close button 0。clickable targetは20×20px／38×38px。
- `PRODUCT.md` / `DESIGN.md` との関係: Mobile Navigation、Focus Management、Accessibility、44×44px操作面。
- 改善の方向性: focus lifecycle、keyboard dismiss、close、return focus、44px操作面を共通interaction contractとして実装する。
- 優先度判断: 38pxはWCAG 2.5.8に合格し、20pxも今回のspacing exceptionで違反未確認。44px未満はDESIGN不整合として扱う。native openerはkeyboardで再操作できるため2.1.1違反は未確認であり、Escape単独も違反根拠にしない。P1の根拠は、背景へ抜けるfocus orderの2.4.3と、overlayに隠れた背景へfocusする2.4.11の明確な阻害である。

### CF-007 — 検索inputと状態表示にlabel・contrastのcontrol基盤がない

- 最終優先度: P1
- テーマ: Accessible Search Controls
- 状態: 新規
- 根本原因: semantic control tokensとlabel contractがなく、placeholder、薄いgray、低contrast borderを個別指定している。
- 統合したFinding ID: IMP-A-005
- Product / UXへの影響: 入力目的、placeholder、状態、入力境界が低視力・支援技術利用で識別しにくい。
- 技術的根拠: label 0、placeholder 3.41:1、gray-400 2.54:1、input border 1.47:1。
- `PRODUCT.md` / `DESIGN.md` との関係: Interaction States、Accessibility、visible label、control border。
- 改善の方向性: visible label、semantic text/control-border tokens、focus-visibleを共通control contractへまとめる。
- 優先度判断: WCAG 1.4.3、1.4.11、3.3.2の明確な不足を含むためP1。

### CF-008 — 長期履歴の全レコードを同時にDOMへ置く構造に上限がない

- 最終優先度: P1
- テーマ: Performance / Archive Scale
- 状態: 新規
- 根本原因: Repositoryから表示までpagination / windowing / 日付単位読込がなく、取得した全レコードを同時にrenderし、ローカル検索も全件走査する。
- 統合したFinding ID: IMP-A-006
- Product / UXへの影響: 長期保存するほどDOM、hydration、検索処理が増え、「継続的に再訪できる」目的と逆行する。
- 技術的根拠: 326 recordsすべてがDOMに存在し3475 DOM elements。628 `img` elementsのうち201は測定時`complete === false`だが、network状態・転送量は未測定であり性能劣化件数とは扱わない。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Purpose、元の環境から独立して長期保存、メディア安定性。
- 改善の方向性: 検索anchorと前後文脈を壊さない長期タイムライン読込方式をDecisionとして先に確定する。
- 優先度判断: 現実の326件で全件DOM構造が確認され、中心成果の継続性に上限を作るためP1。CF-001の到達失敗への寄与はあり得るが、直接failure mechanismとは断定しない。

### CF-009 — 正式なDesign Foundationとライト／ダークの実装基盤がない

- 最終優先度: P2
- テーマ: Design System / Theming
- 状態: 新規
- 根本原因: DESIGN frontmatterをsemantic tokensへ変換する共通入口がなく、生Tailwind paletteとArialを個別指定する。
- 統合したFinding ID: PD-007, IMP-A-007
- Product / UXへの影響: 静かな記録帖固有の階層と一貫性が出ず、ダーク環境で中心体験を提供できない。
- 技術的根拠: raw palette 544件、`dark:` 0、body Arial、`color-scheme: normal`。
- `PRODUCT.md` / `DESIGN.md` との関係: Product Principle 10、Color and Themes、Typography、Design Tokens。
- 改善の方向性: 最小semantic tokens・typography・interaction stateを先に導入し、full light/dark対応を後続phaseに分ける。
- 優先度判断: 中心フローはライトで利用できるためP2。ただしCF-003・CF-007・CF-010の実装前提として優先度と別に先行できる。

### CF-010 — 検索結果が連続リストでなくカード反復になっている

- 最終優先度: P2
- テーマ: Search Scanability
- 状態: 新規
- 根本原因: 検索結果を独立対象のカードとして扱い、一致理由・行長・時系列比較の情報設計を優先していない。
- 統合したFinding ID: PD-006, IMP-C-006, IMP-A-011
- Product / UXへの影響: 結果比較に時間がかかり、MobileとDesktopの双方で再発見の入口が重い。
- 技術的根拠: 全件`rounded-lg border`; 24件; 一致強調なし; Desktop長行。
- `PRODUCT.md` / `DESIGN.md` との関係: Rediscovery Model、連続面、reading max。
- 改善の方向性: 一致中心抜粋、控えめな語強調、連続リスト、必要最小限のグルーピングへ整理する。
- 優先度判断: 検索自体と結果選択は可能なためP2。

### CF-011 — 位置移動のmotionにreduced-motion代替がない

- 最終優先度: P2
- テーマ: Motion Accessibility
- 状態: 新規
- 根本原因: `smooth`を直接指定し、motion tokenと利用者設定の分岐を持たない。
- 統合したFinding ID: IMP-A-009
- Product / UXへの影響: 長距離移動で位置認識と快適性を損ない、動きを減らしたい利用者の設定を尊重できない。
- 技術的根拠: `behavior: "smooth"` 1件; reduced-motion実装0件。
- `PRODUCT.md` / `DESIGN.md` との関係: Motion、Accessibility。
- 改善の方向性: reduced時は即時、通常時も大距離と到着状態を制御するsemantic motion contractを使う。
- 優先度判断: WCAG 2.3.3はAAAでありAAの直接違反ではない。中心フローは静止操作で代替可能なためP2。

## Issue化候補

次の10件をGitHub Issueとして作成した。候補番号は本監査文書内の追跡用であり、Issue間の前提・後続・関連関係は実Issue番号で相互参照する。

| # | GitHub Issue | Issueタイトル | 対象CF | 対応範囲 | Issue種別 | 監査優先度 | まとめる／分割する理由 | 設計判断 | 前提・後続関係 |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | [#140](https://github.com/kikun-dev/talk-archive/issues/140) | 最小semantic token・typography・interaction state基盤を導入する | CF-009 | phase 1 | Refactor | P2 | full themeより先に、本文・metadata・surface・text・border・focusの最小aliasを共通入口へ置く。P2だが他Issueの暫定値増加を防ぐ前提である。 | 必要 | 実装順序の最初。#145・#146・#148・#149の前提。 |
| 2 | [#141](https://github.com/kikun-dev/talk-archive/issues/141) | 長期タイムラインの読込・anchor方式を決定する | CF-008 | — | Decision | P1 | pagination / windowing / 日付単位読込は検索anchor、前後文脈、ローカル検索へ影響するため、実装前に方式を決める。network loadの仮定は判断根拠にしない。 | 必要 | #144・#146の前提。 |
| 3 | [#142](https://github.com/kikun-dev/talk-archive/issues/142) | Mobile overlayとicon controlのaccessibility contractを修正する | CF-006 | — | Bug | P1 | focus lifecycle、keyboard dismiss、close、return focus、44pxプロジェクト基準を同じnavigation component群で検証できる。WCAG 2.5.8合否とは分ける。 | 不要 | #143と並行可能。 |
| 4 | [#143](https://github.com/kikun-dev/talk-archive/issues/143) | 会話閲覧時のMobile shellを一段へ整理する | CF-005 | — | Feature | P2 | 二重ヘッダーはoverlay a11yと根本原因・検証条件が異なるため#142から分割する。利用者が見るnavigation構造を変更するためFeatureとする。 | 必要 | #142と並行可能。#146とMobile layoutを整合。 |
| 5 | [#144](https://github.com/kikun-dev/talk-archive/issues/144) | 検索結果から対象へ安定到達し現在位置を通知する | CF-001, CF-011 | — | Feature | P1 | 位置決定、成功確認、静かな強調、支援技術通知、reduced-motion分岐は同じ`scrollToRecord`到達interactionを完成させる。motionはcontrol基盤ではなく本Issueへ含める。 | 必要 | #141のDecision後。#146のcurrent position表現と整合。 |
| 6 | [#145](https://github.com/kikun-dev/talk-archive/issues/145) | 検索inputと状態表示をaccessible control contractへ揃える | CF-007 | — | Bug | P1 | label、文字contrast、control boundary、focus-visibleは同じ検索formのWCAG検証単位。motionとは分割する。 | 不要 | #140の最小token後。 |
| 7 | [#146](https://github.com/kikun-dev/talk-archive/issues/146) | Timelineを日付と前後文脈が読める連続面へ再設計する | CF-002, CF-003 | — | Feature | P1 | 日付区切り、時刻、reading typography、bubble/shadow廃止、本文・メディア列を一つのTimeline Design判断として扱う。 | 必要 | 前提は#140・#141。#143のMobile layout、#144のcurrent position表現と整合。 |
| 8 | [#147](https://github.com/kikun-dev/talk-archive/issues/147) | Desktopの閲覧状態と記録・管理状態を分離する | CF-004 | — | Feature | P2 | Composerの段階開示とmode clarityはTimeline visual redesignと別の操作モード判断であり、単独で検証できる。利用者が見るmode遷移を変更するためFeatureとする。 | 必要 | #146と並行または後続。 |
| 9 | [#148](https://github.com/kikun-dev/talk-archive/issues/148) | 検索結果を一致箇所中心の連続リストへ整理する | CF-010 | — | Feature | P2 | card repetition、scanability、responsive行長を検索結果固有の情報設計として扱う。 | 必要 | #140後。#144と並行可能。 |
| 10 | [#149](https://github.com/kikun-dev/talk-archive/issues/149) | full light/dark theme対応を完成する | CF-009 | phase 2 | Feature | P2 | 最小token導入と全画面のライト／ダーク対応は影響範囲と検証量が異なるためphaseを分ける。 | 必要 | #140と主要画面移行後。 |

推奨実装順序は **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**。これは依存関係と手戻り最小化の順であり、優先度順ではない。P1の候補3は候補1・2を待たず並行でき、候補5は候補2のDecision後に着手する。P2の候補1は前提基盤として先行し、候補10のfull themeは後続へ分ける。

## Audit Summary

- Product Design Auditの主要評価: 会話一覧・検索・タイムラインを結ぶルートの骨格は正しい。しかし検索結果から対象へ到達できず、日付文脈も表示されないため、中心成果「再発見から前後の文脈へ戻る」が検索起点で成立しない。タイムラインはチャット吹き出しとDesktop Composerにより、静かな個人記録帖より管理付きチャットに見える。
- Design Health Score: **16/40（Poor）**
- Audit Health Score: **5/20（Critical）**
- Health Scoreラベル根拠: Impeccable `reference/critique.md`の12–19=`Poor`、`reference/audit.md`の0–5=`Critical`という明示的な点数帯に基づく。
- Consolidated Findings: **P0 0件 / P1 6件 / P2 5件 / P3 0件**
- 最優先テーマ: **長期履歴でも検索対象へ安定到達し、対象を静かに識別・通知したうえで、日付と前後文脈を連続面として読めること**
- Current Strengths: 検索結果を元タイムラインへ戻すURL設計、内容を過演出しない姿勢、複数の再発見入口、標準メディアcontrols。
- Evidence Limitations: ダークテーマ、データ変更操作、スクリーンリーダー実機、全状態の200% zoom、Lighthouse／本番ネットワークは未評価。スクリーンショットは私的データ保護のためGit管理していない。
- 推奨する実装順序: 最小semantic token/typography基盤 → 長期タイムラインDecision → overlay/icon a11y → Mobile shell → 検索anchor/current position/reduced motion → 検索control a11y → 連続Timeline → 閲覧／管理モード → 検索結果scanability → full light/dark theme。優先度と依存順序は別に扱う。
- 過去監査: `docs/audits/design/` に過去文書はなく、本書が初回監査。すべてのCFは「新規」。
- 変更確認: 監査文書以外のコード、UI、テスト、`PRODUCT.md`、`DESIGN.md`、監査対象データは変更していない。Issue対応状況は「Issue化候補」を参照。
