/**
 * Inline AI chat for #entryTextarea and #reply.
 * Uses Cloudflare Turnstile + https://bot.kaydansky.ru/api.
 */

const DEFAULT_API_BASE_URL = 'https://bot.kaydansky.ru/api';
const DEFAULT_TURNSTILE_SITEKEY = '0x4AAAAAACb6BOyZu2RAFx_D';

let chatTurnstileWidgetId = null;
let pendingCaptchaResolve = null;
let pendingCaptchaReject = null;
let turnstileRendered = false;

function resolveTurnstileSitekey() {
  if (window.APP_CONFIG && typeof window.APP_CONFIG.turnstileSitekey === 'string' && window.APP_CONFIG.turnstileSitekey.trim()) {
    return window.APP_CONFIG.turnstileSitekey.trim();
  }
  return DEFAULT_TURNSTILE_SITEKEY;
}

function buildTurnstileError(errorCode) {
  const code = String(errorCode || '').trim();
  if (code === '110200') {
    const hostname = window.location.hostname;
    const url = `${window.location.protocol}//${hostname}`;
    return new Error(
      `CAPTCHA failed: Turnstile rejected this origin (${url}). ` +
      `Verify the Site Key is correct and add "${hostname}" to "Allowed Domains" in your Cloudflare Turnstile dashboard.`
    );
  }

  if (code) {
    console.error(`[Turnstile] Error code ${code}`, {
      origin: window.location.origin,
      hostname: window.location.hostname,
      sitekey: resolveTurnstileSitekey(),
    });
    return new Error(`CAPTCHA verification failed (error code ${code}). Check console for details.`);
  }

  return new Error('CAPTCHA verification failed.');
}

function getTurnstileContainer() {
  return document.getElementById('chat-turnstile');
}

function getCaptchaMask() {
  let mask = document.getElementById('captcha-mask');
  if (mask) return mask;

  mask = document.createElement('div');
  mask.id = 'captcha-mask';
  mask.style.position = 'fixed';
  mask.style.inset = '0';
  mask.style.background = 'rgba(0, 0, 0, 0.45)';
  mask.style.display = 'none';
  mask.style.zIndex = '9999';
  document.body.appendChild(mask);
  return mask;
}

function showTurnstileChallenge(container) {
  const mask = getCaptchaMask();
  mask.style.display = 'block';

  container.style.position = 'fixed';
  container.style.top = '50%';
  container.style.left = '50%';
  container.style.transform = 'translate(-50%, -50%)';
  container.style.visibility = 'visible';
  container.style.pointerEvents = 'auto';
  container.style.zIndex = '10000';
  container.style.display = 'flex';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  container.style.width = '330px';
  container.style.height = '78px';
  container.style.background = 'white';
  container.style.borderRadius = '4px';
  container.style.padding = '0';
  
  // Ensure light theme for Turnstile visibility
  if (document.documentElement.classList.contains('dark-theme')) {
    container.style.boxShadow = '0 2px 10px rgba(255,255,255,0.2)';
  } else {
    container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  }
}

function hideTurnstileChallenge(container) {
  const mask = document.getElementById('captcha-mask');
  if (mask) {
    mask.style.display = 'none';
  }

  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.transform = 'none';
  container.style.visibility = 'hidden';
  container.style.pointerEvents = 'none';
  container.style.display = 'none';
}

function settleCaptcha(token, error) {
  if (error) {
    if (pendingCaptchaReject) pendingCaptchaReject(error);
  } else if (pendingCaptchaResolve) {
    pendingCaptchaResolve(token);
  }

  pendingCaptchaResolve = null;
  pendingCaptchaReject = null;
}

function renderTurnstileWidget() {
  if (!window.turnstile) return false;

  const container = getTurnstileContainer();
  if (!container) return false;

  if (turnstileRendered && chatTurnstileWidgetId !== null) return true;

  try {
    chatTurnstileWidgetId = window.turnstile.render('#chat-turnstile', {
      sitekey: resolveTurnstileSitekey(),
      size: 'normal',
      theme: document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light',
      execution: 'execute',
      callback(token) {
        hideTurnstileChallenge(container);
        settleCaptcha(token, null);
      },
      'error-callback'(errorCode) {
        hideTurnstileChallenge(container);
        settleCaptcha(null, buildTurnstileError(errorCode));
      },
      'expired-callback'() {
        hideTurnstileChallenge(container);
        settleCaptcha(null, new Error('CAPTCHA token expired.'));
      },
    });
    turnstileRendered = true;
    hideTurnstileChallenge(container);
    return true;
  } catch (error) {
    turnstileRendered = false;
    settleCaptcha(null, error);
    return false;
  }
}

function initializeTurnstileOnFirstLoad() {
  if (window.turnstile) {
    renderTurnstileWidget();
  }
}

async function waitForTurnstile(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (!window.turnstile) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Turnstile is not loaded yet.');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

window.onloadTurnstileCallback = function onloadTurnstileCallback() {
  initializeTurnstileOnFirstLoad();
};

window.getChatCaptchaToken = function getChatCaptchaToken() {
  return new Promise((resolve, reject) => {
    if (pendingCaptchaReject) {
      pendingCaptchaReject(new Error('CAPTCHA request was replaced by a new one.'));
    }

    pendingCaptchaResolve = resolve;
    pendingCaptchaReject = reject;

    (async () => {
      try {
        await waitForTurnstile();

        if (!renderTurnstileWidget() || chatTurnstileWidgetId === null) {
          throw new Error('Turnstile widget is not ready.');
        }

        const container = getTurnstileContainer();
        if (!container) {
          throw new Error('Turnstile container not found.');
        }

        showTurnstileChallenge(container);
        window.turnstile.reset(chatTurnstileWidgetId);
        window.turnstile.execute(chatTurnstileWidgetId);
      } catch (error) {
        const container = getTurnstileContainer();
        if (container) {
          hideTurnstileChallenge(container);
        }
        settleCaptcha(null, error);
      }
    })();
  });
};

class AISupportChatWidget {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || DEFAULT_API_BASE_URL;
    this.authMode = (options.authMode || 'public').toLowerCase();
    this.authToken = options.authToken || '';
    this.getAuthToken = typeof options.getAuthToken === 'function' ? options.getAuthToken : null;
    this.getCaptchaToken = typeof options.getCaptchaToken === 'function' ? options.getCaptchaToken : null;
    this.captchaToken = options.captchaToken || '';
    this.tokenRefreshBufferSeconds = options.tokenRefreshBufferSeconds || 10;

    this.cachedToken = '';
    this.cachedTokenExp = 0;
    this.conversationId = null;
    this.sessionCaptchaToken = '';
    this.sessionCaptchaPromise = null;
    this.hasPassedSessionCaptcha = false;
    this.isProcessing = false;

    const inputId = options.inputId || 'entryTextarea';
    const replyId = options.replyContainerId || 'reply';

    this.inputField = document.getElementById(inputId);
    this.messagesContainer = document.getElementById(replyId);

    if (!this.inputField) {
      throw new Error(`Input element #${inputId} not found.`);
    }
    if (!this.messagesContainer) {
      throw new Error(`Reply container #${replyId} not found.`);
    }

    this.messagesContainer.classList.add('ai-chat-thread');
    this.addEventListeners();
    this.addMessage('assistant', 'Здравствуйте! Я ИИ-помощник. Готов отвечать на Ваши вопросы.');
  }

  addEventListeners() {
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.inputField.addEventListener('input', () => {
      this.autoResizeInput();
    });
  }

  autoResizeInput() {
    this.inputField.style.height = 'auto';
    this.inputField.style.height = `${Math.min(this.inputField.scrollHeight, 220)}px`;
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  makeLinksClickable(text) {
    const escaped = this.escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return escaped.replace(urlRegex, (url) => {
      const cleanedUrl = url.replace(/[^\w\-._~:/?#[\]@!$&'()*+,;=%]$/, '');
      return `<a href="${cleanedUrl}" target="_blank" rel="noopener noreferrer">${cleanedUrl}</a>`;
    });
  }

  addMessage(role, content) {
    const listItem = document.createElement('li');
    listItem.className = `ai-chat-entry ai-chat-entry-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-entry-bubble';
    bubble.innerHTML = this.makeLinksClickable(content);

    listItem.appendChild(bubble);
    this.messagesContainer.appendChild(listItem);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  addTypingIndicator() {
    const listItem = document.createElement('li');
    listItem.className = 'ai-chat-entry ai-chat-entry-assistant ai-chat-typing';
    listItem.innerHTML = `
      <div class="ai-chat-entry-bubble">
        <span></span><span></span><span></span>
      </div>
    `;
    this.messagesContainer.appendChild(listItem);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    return listItem;
  }

  async sendMessage() {
    const message = this.inputField.value.trim();
    if (!message || this.isProcessing) return;

    this.isProcessing = true;
    this.addMessage('user', message);
    this.inputField.value = '';
    this.autoResizeInput();
    this.inputField.disabled = true;

    const typingIndicator = this.addTypingIndicator();

    try {
      const response = await this.sendChatRequest(message);
      typingIndicator.remove();
      this.addMessage('assistant', response.result || 'Ответ пуст.');
    } catch (error) {
      typingIndicator.remove();
      this.addMessage('assistant', 'Простите, произошла ошибка. Пожалуйста, попробуйте позже.');
      console.error('Chat error:', error);
    } finally {
      this.isProcessing = false;
      this.inputField.disabled = false;
      this.inputField.focus();
    }
  }

  async getValidToken(forceRefresh = false) {
    const now = Math.floor(Date.now() / 1000);
    if (!forceRefresh && this.cachedToken && this.cachedTokenExp > (now + this.tokenRefreshBufferSeconds)) {
      return this.cachedToken;
    }

    let token = '';
    if (this.getAuthToken) {
      token = await this.getAuthToken();
    } else if (this.authToken) {
      token = this.authToken;
    }

    if (!token || typeof token !== 'string') {
      throw new Error('Authentication token is missing.');
    }

    this.cachedToken = token;
    this.cachedTokenExp = this.extractTokenExp(token);
    return token;
  }

  extractTokenExp(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return 0;

      const payloadSegment = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = payloadSegment.length % 4;
      const base64 = padding ? payloadSegment + '='.repeat(4 - padding) : payloadSegment;
      const payload = JSON.parse(atob(base64));
      return typeof payload.exp === 'number' ? payload.exp : 0;
    } catch (error) {
      return 0;
    }
  }

  async authFetch(url, options = {}, retry = true) {
    if (this.authMode === 'public') {
      return fetch(url, options);
    }

    const token = await this.getValidToken(false);
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 && retry && this.getAuthToken) {
      const refreshed = await this.getValidToken(true);
      return fetch(url, {
        ...options,
        headers: {
          ...headers,
          Authorization: `Bearer ${refreshed}`,
        },
      });
    }

    return response;
  }

  async getCaptchaTokenValue() {
    if (this.getCaptchaToken) {
      return this.getCaptchaToken();
    }
    return this.captchaToken;
  }

  async ensurePublicSessionCaptcha() {
    if (this.authMode !== 'public') return '';
    if (this.hasPassedSessionCaptcha && this.sessionCaptchaToken) {
      return this.sessionCaptchaToken;
    }

    if (!this.sessionCaptchaPromise) {
      this.sessionCaptchaPromise = (async () => {
        const token = await this.getCaptchaTokenValue();
        if (!token || typeof token !== 'string') {
          throw new Error('CAPTCHA token is missing for public mode.');
        }

        this.sessionCaptchaToken = token;
        this.hasPassedSessionCaptcha = true;
        return token;
      })().finally(() => {
        this.sessionCaptchaPromise = null;
      });
    }

    return this.sessionCaptchaPromise;
  }

  async sendChatRequest(message) {
    let captchaToken = '';
    if (this.authMode === 'public' && !this.conversationId) {
      captchaToken = await this.ensurePublicSessionCaptcha();
    }

    const payload = {
      query: message,
      conversationId: this.conversationId,
    };

    if (this.authMode === 'public' && !this.conversationId) {
      payload.captchaToken = captchaToken;
    }

    const initResponse = await this.authFetch(`${this.apiBaseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!initResponse.ok) {
      const messageText = await this.extractErrorMessage(initResponse, `Failed to send message: ${initResponse.status}`);
      throw new Error(messageText);
    }

    const initData = await initResponse.json();
    this.conversationId = initData.conversationId;
    return this.pollForResult(initData.requestId);
  }

  async pollForResult(requestId) {
    const maxAttempts = 30;
    const pollInterval = 1000;

    for (let i = 0; i < maxAttempts; i += 1) {
      const response = await this.authFetch(
        `${this.apiBaseUrl}/chat-result?requestId=${requestId}&conversation_id=${this.conversationId}&timeout=1`
      );

      if (!response.ok) {
        const messageText = await this.extractErrorMessage(response, `Failed to get result: ${response.status}`);
        throw new Error(messageText);
      }

      const data = await response.json();
      if (data.status === 'completed') return data;
      if (data.status === 'failed') throw new Error(data.error || 'Request failed');

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Request timeout');
  }

  async extractErrorMessage(response, fallback) {
    try {
      const data = await response.json();
      if (data && typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
    } catch (error) {
      // Ignore parse errors and use fallback.
    }
    return fallback;
  }
}

function injectInlineChatStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #reply.ai-chat-thread {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 60vh;
      overflow-y: auto;
    }

    #reply .ai-chat-entry {
      display: flex;
      max-width: 100%;
    }

    #reply .ai-chat-entry-user {
      justify-content: flex-end;
    }

    #reply .ai-chat-entry-assistant {
      justify-content: flex-start;
    }

    #reply .ai-chat-entry-bubble {
      max-width: min(90%, 740px);
      padding: 10px 14px;
      border-radius: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--border-color);
      background: var(--entry-bg);
      color: var(--text-color);
      font-size: 1.05rem;
    }

    #reply .ai-chat-entry-user .ai-chat-entry-bubble {
      background: #357aa9;
      border-color: #357aa9;
      color: #fff;
    }

    #reply .ai-chat-entry-bubble a {
      color: inherit;
      text-decoration: underline;
    }

    #reply .ai-chat-typing .ai-chat-entry-bubble span {
      width: 7px;
      height: 7px;
      display: inline-block;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.5;
      margin-right: 5px;
      animation: ai-chat-typing 1.2s infinite ease-in-out;
    }

    #reply .ai-chat-typing .ai-chat-entry-bubble span:nth-child(2) {
      animation-delay: 0.15s;
    }

    #reply .ai-chat-typing .ai-chat-entry-bubble span:nth-child(3) {
      animation-delay: 0.3s;
      margin-right: 0;
    }

    @keyframes ai-chat-typing {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
      40% { transform: translateY(-3px); opacity: 0.9; }
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
  injectInlineChatStyles();
  getCaptchaMask();
  initializeTurnstileOnFirstLoad();

  window.initAISupportChat = function initAISupportChat(options = {}) {
    if (window.aiSupportChat && !options.forceReinit) {
      return window.aiSupportChat;
    }

    const resolvedOptions = {
      authMode: 'public',
      getCaptchaToken: window.getChatCaptchaToken,
      ...options,
    };

    window.aiSupportChat = new AISupportChatWidget(resolvedOptions);
    return window.aiSupportChat;
  };

  const inputField = document.getElementById('entryTextarea');
  const messagesContainer = document.getElementById('reply');
  if (inputField && messagesContainer && !window.aiSupportChat) {
    window.initAISupportChat();
  }
});
