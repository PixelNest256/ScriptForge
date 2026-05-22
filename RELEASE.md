# Release checklist

## v0.1.0

- [ ] `npm run package` — builds and creates `dist/scriptforge-extension.zip`
- [ ] Load `extension/` in Chrome via Load unpacked
- [ ] Smoke test: API key → generate → approve → enable → page change
- [ ] Create GitHub tag `v0.1.0` with release notes
- [ ] Attach `dist/scriptforge-extension.zip` to GitHub Release
- [ ] Chrome Web Store: see [store/CHROME_WEB_STORE.md](store/CHROME_WEB_STORE.md)

## Release notes template

### Added
- AI userscript generation (Anthropic API)
- Static analysis gate (acorn AST)
- Permission confirmation UI
- Export/import `.user.js`
- SHA-256 tamper detection
- Side panel UI
