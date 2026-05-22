import { capturePageContextInPage } from './page-capture-fn.js';

export const PAGE_CONTEXT_HTML = 'html';
export const PAGE_CONTEXT_DOM = 'dom';

/** Page content limit when sending to API (characters) */
export const API_CONTENT_LIMIT = {
  dom: 28000,
  html: 45000,
};

export function normalizePageContextSettings(settings = {}) {
  const mode = settings.pageContextMode === PAGE_CONTEXT_HTML ? PAGE_CONTEXT_HTML : PAGE_CONTEXT_DOM;
  return { pageContextMode: mode };
}

const RESTRICTED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

export function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
}

export async function captureActiveTabPageContext(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  if (isRestrictedUrl(tab.url)) {
    throw new Error('Cannot get HTML/DOM from this page (browser internal page)');
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: capturePageContextInPage,
    args: [mode],
  });

  if (!result?.content) {
    throw new Error('Failed to get page content');
  }

  return result;
}

/** Limit page content for API transmission */
export function limitPageContextForApi(pageContext, maxChars) {
  const defaultMax =
    maxChars ?? API_CONTENT_LIMIT[pageContext.mode] ?? API_CONTENT_LIMIT.dom;
  if (pageContext.content.length <= defaultMax) {
    return { ...pageContext, apiTruncated: false };
  }
  return {
    ...pageContext,
    content: pageContext.content.slice(0, defaultMax),
    truncated: true,
    apiTruncated: true,
  };
}

export function buildMinimalPagePrompt(userPrompt, pageContext) {
  return `Generate a userscript for this page.

URL: ${pageContext.url}
Title: ${pageContext.title}

Note: Full page snapshot was omitted because the API request failed (likely too large). Use common patterns for this site type and the user request.

User request:
${userPrompt}

Use @match like: ${suggestMatchPattern(pageContext.url)}`;
}

function suggestMatchPattern(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return '*://*/*';
  }
}

export function buildPromptWithPageContext(userPrompt, pageContext) {
  const modeLabel = pageContext.mode === PAGE_CONTEXT_HTML ? 'HTML (full page)' : 'DOM (serialized tree)';
  const truncNote = pageContext.truncated
    ? '\nNote: Content was truncated due to size limits.'
    : '';

  return `You are generating a userscript for the following web page.

## Current page
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Snapshot type: ${modeLabel}${truncNote}

## Page ${pageContext.mode.toUpperCase()} snapshot
\`\`\`
${pageContext.content}
\`\`\`

## User request
${userPrompt}

Use the page snapshot above to choose accurate selectors (@match should use the current URL pattern: ${pageContext.url}).`;
}
