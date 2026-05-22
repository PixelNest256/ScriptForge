# ScriptForge

AI駆動の Userscript マネージャー。自然言語でスクリプトを生成し、静的解析と権限確認を経てから安全に実行します。

## 機能

- OpenAI 互換 API による Userscript 生成（OpenAI / OpenRouter / Ollama / LM Studio 等）
- AST ベースの静的解析（acorn）
- 危険パターンの即時ブロック（eval, new Function, 動的 import 等）
- 権限確認 UI（人間による GO/NO）
- SHA-256 ハッシュによる改ざん検知
- `.user.js` のエクスポート / インポート（ファイル・URL）
- Chrome サイドパネル対応

## 開発

```bash
npm install
npm run build
node scripts/generate-icons.mjs
```

### Chrome に読み込む

1. `chrome://extensions` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」
4. `extension/` フォルダを選択

## 使い方

1. 拡張機能の「設定」タブで API ベース URL・キー・モデルを保存（プリセット可）
2. 「設定」で AI に渡す形式を選択：**DOM ツリー**（推奨）または **HTML 全文**（生成時に常に送信）
3. 対象ページを開いた状態で「作成」タブから自然言語の指示を入力
3. 権限確認画面で承認
4. 一覧でスクリプトを有効化し、対象サイトを開く

### API 設定例

| プロバイダ | ベース URL | モデル例 |
|-----------|------------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio | `http://localhost:1234/v1` | ロードしたモデル名 |

## プライバシー（ページ情報の送信）

スクリプト生成時、**設定で選んだ形式**（DOM ツリー または HTML 全文）で現在タブの内容が API プロバイダへ送信されます。機密ページでは利用を避えてください。

## セキュリティ

- 生成コードは実行前に必ず静的解析と権限確認を通過
- スクリプトは `chrome.userScripts`（USER_SCRIPT ワールド）で実行（`eval` / `new Function` 不使用・CSP 準拠）
- 有効化・保存後は**対象ページの再読み込み**が必要な場合があります
- 詳細は [SECURITY.md](SECURITY.md)

## ライセンス

MIT — 詳細は [LICENSE](LICENSE)
