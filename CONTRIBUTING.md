# Contributing to ScriptForge

## 開発環境

- Node.js 18+
- Chrome / Edge（Chromium）

```bash
npm install
npm run build
```

## 変更の流れ

1. Issue または Discussion で変更内容を共有（大きな変更の場合）
2. ブランチを切って実装
3. `npm run build` が通ることを確認
4. Pull Request を作成

## 静的解析エンジン

`src/analyzer/` に権限検出・危険パターンのルールがあります。新しい API パターンを追加する場合はテスト用の `.user.js` サンプルとともに PR してください。

## コーディング規約

- ES modules
- 拡張機能ページでは `eval` 禁止（MV3 CSP）
- ユーザー API キーをソースに含めない

## セキュリティ報告

脆弱性は公開 Issue ではなく、SECURITY.md の手順で報告してください。
