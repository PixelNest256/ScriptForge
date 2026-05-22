# Chrome Web Store 申請メモ

## 審査説明（ドラフト）

ScriptForge はユーザーがローカルに保存した Userscript を、静的解析と明示的な権限承認の後にのみ実行します。

- AI（OpenAI 互換 API）はコード生成のみ。ユーザーが設定した API エンドポイントへ直接リクエストし、取得したコードを即実行することはありません。
- すべてのスクリプトは保存前に AST 解析を通過し、危険な構文（eval, new Function 等）はブロックされます。
- ユーザーは権限確認画面で各操作（ネットワーク、Cookie、キー入力等）を確認してから承認します。
- 実行は `chrome.scripting.executeScript` の Isolated World で行い、ページの JavaScript コンテキストとは分離されます。

## 権限の正当化

| 権限 | 理由 |
|------|------|
| `<all_urls>` | Userscript の @match パターンに基づき任意サイトで動作 |
| `scripting` | 承認済みスクリプトの注入 |
| `storage` | スクリプトと設定のローカル保存 |
| `downloads` | .user.js エクスポート |

## パッケージ手順

1. `npm run build`
2. `extension/` ディレクトリを ZIP（ルートに manifest.json があること）
3. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) からアップロード

## GitHub リリース

タグ `v0.1.0` でソースと `scriptforge-extension.zip` を添付。
