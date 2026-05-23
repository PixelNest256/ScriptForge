import { MSG } from '../shared/messages.js';
import { parseUserscriptMeta } from '../shared/hash.js';
import { chatCompletion, chatCompletionStream, normalizeLlmSettings, isRetryableApiError } from '../shared/llm.js';
import {
  captureActiveTabPageContext,
  buildPromptWithPageContext,
  buildMinimalPagePrompt,
  limitPageContextForApi,
  normalizePageContextSettings,
} from '../shared/page-context.js';

const SYSTEM_PROMPT = `You are a userscript generator for ScriptForge browser extension.
Think step by step, then output a complete Tampermonkey-compatible userscript inside a single markdown code block (use \`\`\`javascript ... \`\`\`).

Requirements:
- First, explain your approach briefly in natural language (1-3 sentences).
- Then output the userscript code inside \`\`\`javascript ... \`\`\` fences.
- The script must start with // ==UserScript== block containing @name (format: one emoji followed by a space and the name, e.g. 🎨 Page Colorizer), @description, @match (at least one), @version
- End metadata with // ==/UserScript==
- Body must be an IIFE: (function () { 'use strict'; ... })();
- NEVER use eval, new Function, dynamic import(), or string arguments to setTimeout/setInterval
- Prefer DOM styling/manipulation only unless user explicitly needs network/storage
- Use @match patterns appropriate for the current page URL provided in the user message
- Use selectors that match the provided page HTML or DOM snapshot
- Add @generated-by and @generated-at in metadata (@generated-by should include the model name)
- Write code in JavaScript only`;

export async function generateScript(prompt, settings) {
  const llm = normalizeLlmSettings(settings);
  const { pageContextMode } = normalizePageContextSettings(settings);

  if (!llm.llmApiKey && !isLocalBaseUrl(llm.llmBaseUrl)) {
    throw new Error('API key not set (can be empty for local APIs)');
  }

  const pageContext = await captureActiveTabPageContext(pageContextMode);
  const limited = limitPageContextForApi(pageContext);

  let userPrompt = buildPromptWithPageContext(prompt, limited);
  let usedMinimal = false;

  try {
    const text = await chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      settings,
    });
    return finishGeneration(text, llm.llmModel, pageContext, limited);
  } catch (firstErr) {
    if (!isRetryableApiError(firstErr)) throw firstErr;

    const smaller = limitPageContextForApi(pageContext, 10000);
    userPrompt = buildPromptWithPageContext(prompt, smaller);

    try {
      const text = await chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        settings,
      });
      return finishGeneration(text, llm.llmModel, pageContext, smaller);
    } catch (secondErr) {
      if (!isRetryableApiError(secondErr)) throw secondErr;

      userPrompt = buildMinimalPagePrompt(prompt, pageContext);
      usedMinimal = true;
      const text = await chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        settings,
      });
      const result = finishGeneration(text, llm.llmModel, pageContext, pageContext);
      result.pageContext.minimalFallback = usedMinimal;
      return result;
    }
  }
}

export async function generateScriptStream(prompt, settings, onToken) {
  const llm = normalizeLlmSettings(settings);
  const { pageContextMode } = normalizePageContextSettings(settings);

  if (!llm.llmApiKey && !isLocalBaseUrl(llm.llmBaseUrl)) {
    throw new Error('API key not set (can be empty for local APIs)');
  }

  const pageContext = await captureActiveTabPageContext(pageContextMode);
  const limited = limitPageContextForApi(pageContext);

  let userPrompt = buildPromptWithPageContext(prompt, limited);
  let usedMinimal = false;

  try {
    const text = await chatCompletionStream({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      settings,
      onToken,
    });
    return finishGeneration(text, llm.llmModel, pageContext, limited);
  } catch (firstErr) {
    if (!isRetryableApiError(firstErr)) throw firstErr;

    const smaller = limitPageContextForApi(pageContext, 10000);
    userPrompt = buildPromptWithPageContext(prompt, smaller);

    try {
      const text = await chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        settings,
      });
      onToken?.(text);
      return finishGeneration(text, llm.llmModel, pageContext, smaller);
    } catch (secondErr) {
      if (!isRetryableApiError(secondErr)) throw secondErr;

      userPrompt = buildMinimalPagePrompt(prompt, pageContext);
      usedMinimal = true;
      const text = await chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        settings,
      });
      onToken?.(text);
      const result = finishGeneration(text, llm.llmModel, pageContext, pageContext);
      result.pageContext.minimalFallback = usedMinimal;
      return result;
    }
  }
}

function finishGeneration(text, modelTag, pageContext, sentContext) {
  const code = stripCodeFences(text);
  return {
    code: injectGeneratedBy(code, modelTag),
    pageContext: { ...pageContext, sentChars: sentContext.content?.length },
  };
}

function isLocalBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function injectGeneratedBy(code, model) {
  const stamp = new Date().toISOString();
  if (code.includes('@generated-by')) {
    return code.replace(/\/\/ @generated-by\s+.+/i, `// @generated-by ${model}`);
  }
  if (code.includes('// ==/UserScript==')) {
    return code.replace(
      '// ==/UserScript==',
      `// @generated-by ${model}\n// @generated-at ${stamp}\n// ==/UserScript==`
    );
  }
  return code;
}

function stripCodeFences(text) {
  const m = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : text;
}

export async function analyzeAndOpenConfirm(code) {
  const result = await chrome.runtime.sendMessage({ type: MSG.ANALYZE_CODE, code });
  if (result.syntaxError) {
    throw new Error(`Syntax error: ${result.syntaxError}`);
  }
  if (result.blocked?.length) {
    const msgs = result.blocked.map((b) => b.message).join('\n');
    throw new Error(`Blocked:\n${msgs}`);
  }
  if (result.lintErrors?.length) {
    throw new Error(`Lint errors:\n${result.lintErrors.join('\n')}`);
  }

  const { meta } = parseUserscriptMeta(code);
  await chrome.storage.local.set({
    pendingScript: {
      code,
      meta,
      permissions: result.permissions,
      notDetected: result.notDetected,
      lintWarnings: result.lintWarnings,
    },
  });

  const url = chrome.runtime.getURL(
    `permissions_ui/confirm.html?ts=${Date.now()}`
  );
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 480,
    height: 560,
  });

  return result;
}
