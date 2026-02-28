/**
 * Chat widget UI for AI chat.
 * Handles DOM events, textarea UX, message rendering/typing indicator.
 */

class AISupportChatWidget {
  constructor(options = {}) {
    this.chatService = options.chatService;
    this.getCaptchaToken = typeof options.getCaptchaToken === 'function' ? options.getCaptchaToken : null;
    
    const inputId = options.inputId || 'entryTextarea';
    const replyId = options.replyContainerId || 'reply';
    const submitButtonId = options.submitButtonId || 'entrySubmitBtn';

    this.inputField = document.getElementById(inputId);
    this.messagesContainer = document.getElementById(replyId);
    this.submitButton = document.getElementById(submitButtonId);

    if (!this.inputField) {
      throw new Error(`Input element #${inputId} not found.`);
    }
    if (!this.messagesContainer) {
      throw new Error(`Reply container #${replyId} not found.`);
    }

    this.messagesContainer.classList.add('ai-chat-thread');
    this.addEventListeners();
    this.autoResizeInput();
    this.updateSubmitButtonState();
    this.isProcessing = false;
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
      this.updateSubmitButtonState();
    });

    if (this.submitButton) {
      this.submitButton.addEventListener('click', () => {
        this.sendMessage();
      });
    }
  }

  autoResizeInput() {
    const computedStyles = window.getComputedStyle(this.inputField);
    const minHeight = parseFloat(computedStyles.minHeight) || 0;
    const maxHeight = parseFloat(computedStyles.maxHeight);

    this.inputField.style.height = 'auto';
    let nextHeight = Math.max(this.inputField.scrollHeight, minHeight);
    if (Number.isFinite(maxHeight)) {
      nextHeight = Math.min(nextHeight, maxHeight);
      this.inputField.style.overflowY = this.inputField.scrollHeight > maxHeight ? 'auto' : 'hidden';
    } else {
      this.inputField.style.overflowY = 'hidden';
    }
    this.inputField.style.height = `${nextHeight}px`;
  }

  updateSubmitButtonState() {
    if (!this.submitButton) return;

    const hasMessage = this.inputField.value.trim().length > 0;
    this.submitButton.disabled = this.isProcessing || !hasMessage;
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
      return `<a href="${cleanedUrl}" target="_blank" rel="noopener noreferrer">Скачать</a>`;
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
    this.updateSubmitButtonState();
    this.addMessage('user', message);
    this.inputField.value = '';
    this.autoResizeInput();
    this.updateSubmitButtonState();
    this.inputField.disabled = true;

    const typingIndicator = this.addTypingIndicator();

    try {
      const response = await this.chatService.sendChatRequest(message, this.getCaptchaToken);
      typingIndicator.remove();
      this.addMessage('assistant', response.result || 'Ответ пуст.');
    } catch (error) {
      typingIndicator.remove();
      this.addMessage('assistant', 'Простите, произошла ошибка. Пожалуйста, попробуйте позже.');
      console.error('Chat error:', error);
    } finally {
      this.isProcessing = false;
      this.inputField.disabled = false;
      // this.inputField.focus();
      this.updateSubmitButtonState();
    }
  }
}

// Export for use in other modules
window.AISupportChatWidget = AISupportChatWidget;