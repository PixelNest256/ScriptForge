# ScriptForge

AI-driven userscript manager for Chrome. Describe what you need in natural language, and ScriptForge generates, analyzes, and installs a Tampermonkey-compatible userscript — all without leaving the browser.

## Features

- **AI script generation** via OpenAI-compatible APIs (OpenAI, OpenRouter, Ollama, LM Studio, etc.)
- **AST-based static analysis** using acorn — blocks dangerous patterns (`eval`, `new Function`, dynamic `import`, etc.) before execution
- **Permission confirmation UI** — review the requested permissions and explicitly approve or reject
- **Tamper detection** via SHA-256 hashing
- **Export / Import** `.user.js` files from file or URL
- **Chrome Side Panel** support
- **Conversation-style Create tab** — prompts appear as chat bubbles; reset with "Create new" button
- **Auto-generated script names** with emoji (e.g. `🎨 Page Colorizer`)

## Quick Start

```bash
npm install
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` directory

### Package for distribution

```bash
npm run package
```

Creates `dist/scriptforge-extension.zip`.

## Usage

1. Open **Settings** from the extension popup and configure your API provider (base URL, API key, model)
2. Choose the page context format to send: **DOM Tree** (recommended) or **Full HTML**
3. Navigate to the target page, open **Create** tab, and describe the script you want in natural language
4. Review permissions on the confirmation dialog and approve
5. Enable the script from the **Scripts** list — reload the target page if needed

### API Provider Examples

| Provider | Base URL | Example Model |
|----------|----------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio | `http://localhost:1234/v1` | loaded model name |

## Privacy

When generating a script, the content of the current tab (DOM Tree or Full HTML, as configured) is sent to the API provider. Avoid using ScriptForge on sensitive pages.

## Security

- Generated code passes static analysis and permission review before execution
- Scripts run via `chrome.userScripts` (USER_SCRIPT world) — no `eval`/`new Function`, CSP-compliant
- After enabling a script, a **page reload** may be required for changes to take effect
- See [SECURITY.md](SECURITY.md) for details

## License

MIT — see [LICENSE](LICENSE)
