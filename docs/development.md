# 開発フロー

## AI駆動開発

実装担当: Claude Code  
レビュー: Codex

---

## 基本ルール

1 Issue = 1 PR

PRは小さくする。

---

## 開発手順

1 Issue作成  
2 Claude Codeで実装  
3 PR作成  
4 CIチェック  
5 Codexレビュー  
6 マージ  

---

## 必須チェック

すべてのPRで以下を通す

- lint
- typecheck
- test
- build

---

## テスト方針

- Unit test
- Component test

Vitest + Testing Library