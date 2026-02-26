/**
 * Chat service for AI chat widget.
 * Handles authFetch, token refresh, /chat + /chat-result polling.
 */

const DEFAULT_API_BASE_URL = 'https://bot.kaydansky.ru/api';

class ChatService {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || DEFAULT_API_BASE_URL;
    this.authMode = (options.authMode || 'public').toLowerCase();
    this.authToken = options.authToken || '';
    this.getAuthToken = typeof options.getAuthToken === 'function' ? options.getAuthToken : null;
    this.tokenRefreshBufferSeconds = options.tokenRefreshBufferSeconds || 10;
    
    this.cachedToken = '';
    this.cachedTokenExp = 0;
    this.conversationId = null;
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

  async sendChatRequest(message, getCaptchaToken) {
    const shouldCloseCaptchaAfterPipeline = this.authMode === 'public' && !this.conversationId;
    let captchaToken = '';
    if (shouldCloseCaptchaAfterPipeline) {
      captchaToken = await this.ensurePublicSessionCaptcha(getCaptchaToken);
    }

    const payload = {
      query: message,
      conversationId: this.conversationId,
    };

    if (shouldCloseCaptchaAfterPipeline) {
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

  async ensurePublicSessionCaptcha(getCaptchaToken) {
    if (this.authMode !== 'public') return '';
    
    // For simplicity, we're assuming the session captcha is handled by the widget
    // In a more complex implementation, this would manage a session token
    const token = await getCaptchaToken();
    if (!token || typeof token !== 'string') {
      throw new Error('CAPTCHA token is missing for public mode.');
    }
    
    return token;
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

// Export for use in other modules
window.ChatService = ChatService;