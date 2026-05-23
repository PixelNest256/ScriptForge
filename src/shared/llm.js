export const LLM_PRESETS = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
];

export const DEFAULT_LLM = {
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  pageContextMode: 'dom',
};

export function normalizeLlmSettings(settings = {}) {
  const baseUrl = (
    settings.llmBaseUrl ||
    settings.apiBaseUrl ||
    DEFAULT_LLM.llmBaseUrl
  ).replace(/\/+$/, '');

  const pageContextMode =
    settings.pageContextMode === 'html' ? 'html' : 'dom';

  return {
    llmBaseUrl: baseUrl,
    llmApiKey: settings.llmApiKey || settings.anthropicApiKey || '',
    llmModel:
      settings.llmModel ||
      settings.anthropicModel ||
      DEFAULT_LLM.llmModel,
    pageContextMode,
  };
}

export function settingsForStorage(form) {
  return {
    llmBaseUrl: form.baseUrl.replace(/\/+$/, ''),
    llmApiKey: form.apiKey,
    llmModel: form.model.trim(),
    pageContextMode: form.pageContextMode === 'html' ? 'html' : 'dom',
  };
}

function chatCompletionsUrl(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function buildProviderHeaders(baseUrl, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://github.com/scriptforge';
    headers['X-Title'] = 'ScriptForge';
  }

  return headers;
}

function parseApiError(status, body) {
  if (body == null) return `API error ${status}`;
  if (typeof body === 'string') return body.slice(0, 500);

  const err = body.error;
  if (typeof err === 'string') return enrichApiError(err, status, body);

  if (err && typeof err === 'object') {
    const parts = [
      err.message,
      typeof err.metadata?.raw === 'string' ? err.metadata.raw : null,
      err.metadata?.provider_name ? `provider: ${err.metadata.provider_name}` : null,
      err.code != null ? `code: ${err.code}` : null,
    ].filter(Boolean);
    if (parts.length) return enrichApiError(parts.join(' — '), status, body);
  }

  const msg = body.message || body.detail;
  if (typeof msg === 'string') return enrichApiError(msg, status, body);
  if (Array.isArray(msg)) {
    return enrichApiError(msg.map((m) => m?.message || m?.msg || m).join(', '), status, body);
  }

  try {
    const brief = JSON.stringify(body).slice(0, 400);
    return enrichApiError(`API error ${status}: ${brief}`, status, body);
  } catch {
    return `API error ${status}`;
  }
}

function enrichApiError(message, status, body) {
  const m = String(message || '');
  const hints = [];

  if (/provider returned error/i.test(m)) {
    hints.push('Upstream provider returned an error (model outage or temporary overload)');
    hints.push('Try "DOM Tree" mode in settings (lighter than full HTML)');
    hints.push('Try a different model name (e.g. openai/gpt-4o-mini on OpenRouter)');
  }
  if (/context|token|length|too large|maximum/i.test(m)) {
    hints.push('Page context is too large. Select DOM Tree in settings or try on a simpler page');
  }
  if (status === 401 || /auth|api.?key|unauthorized/i.test(m)) {
    hints.push('API key is invalid or not set');
  }
  if (status === 404 || /model.*not found|does not exist/i.test(m)) {
    hints.push('Model name does not exist. Check the provider documentation for the correct ID');
  }

  if (hints.length === 0) return m;
  return `${m}\n\n[Troubleshooting hints]\n${hints.map((h) => `• ${h}`).join('\n')}`;
}

function extractMessageContent(data) {
  const choice = data?.choices?.[0];
  if (!choice) return '';

  if (choice.error) {
    const e = choice.error;
    throw new Error(
      typeof e === 'string' ? e : e.message || 'Model returned an error'
    );
  }

  if (choice.finish_reason === 'error') {
    throw new Error('Model finished with error (finish_reason: error)');
  }

  const content = choice.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  return choice.text || '';
}

export async function chatCompletion({ systemPrompt, userPrompt, settings }) {
  const { llmBaseUrl, llmApiKey, llmModel } = normalizeLlmSettings(settings);

  if (!llmModel?.trim()) {
    throw new Error('Please set a model name');
  }

  const url = chatCompletionsUrl(llmBaseUrl);
  const headers = buildProviderHeaders(llmBaseUrl, llmApiKey);

  const body = {
    model: llmModel.trim(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0.3,
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    throw new Error(
      `Network error: ${netErr.message} (check URL, CORS, or local API status)`
    );
  }

  const rawText = await res.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      `API returned non-JSON (${res.status}): ${rawText.slice(0, 200)}`
    );
  }

  if (data.error) {
    throw new Error(parseApiError(res.status, data));
  }

  if (!res.ok) {
    throw new Error(parseApiError(res.status, data));
  }

  const text = extractMessageContent(data);
  if (!text?.trim()) {
    throw new Error(
      'API returned an empty response. Check model name and context length'
    );
  }
  return text.trim();
}

export async function chatCompletionStream({ systemPrompt, userPrompt, settings, onToken }) {
  const { llmBaseUrl, llmApiKey, llmModel } = normalizeLlmSettings(settings);

  if (!llmModel?.trim()) {
    throw new Error('Please set a model name');
  }

  const url = chatCompletionsUrl(llmBaseUrl);
  const headers = buildProviderHeaders(llmBaseUrl, llmApiKey);

  const body = {
    model: llmModel.trim(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 4096,
    temperature: 0.3,
    stream: true,
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    throw new Error(
      `Network error: ${netErr.message} (check URL, CORS, or local API status)`
    );
  }

  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    let data = {};
    try { data = rawText ? JSON.parse(rawText) : {}; } catch {}
    throw new Error(parseApiError(res.status, data));
  }

  let fullText = '';
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Streaming not supported by this browser');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let charsSinceYield = 0;

  function extractDelta(parsed) {
    return (
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      parsed.choices?.[0]?.text ??
      null
    );
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const decoded = decoder.decode(value, { stream: true });
    buffer += decoded;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let payload = trimmed;

      const isData = payload.startsWith('data:');
      if (isData) {
        payload = payload.slice(5).trim();
      } else if (!payload.startsWith('{') && !payload.startsWith('[')) {
        continue;
      }

      if (payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = extractDelta(parsed);
        if (delta) {
          fullText += delta;
          try { onToken?.(delta); } catch {}
          charsSinceYield += delta.length;
          if (charsSinceYield > 5) {
            charsSinceYield = 0;
            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
          }
        }
      } catch {}
    }
  }

  if (!fullText.trim()) {
    throw new Error('API returned an empty response. Check model name and context length');
  }

  return fullText.trim();
}

export function isRetryableApiError(err) {
  const m = String(err?.message || '');
  return (
    /provider returned error/i.test(m) ||
    /context|token|length|too large|maximum/i.test(m) ||
    /empty/i.test(m)
  );
}
