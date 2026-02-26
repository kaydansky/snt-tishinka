/**
 * Chat initialization for AI chat widget.
 * DOMContentLoaded bootstrap and wiring dependencies.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize chat components
  const inputField = document.getElementById('entryTextarea');
  const messagesContainer = document.getElementById('reply');
  
  if (inputField && messagesContainer) {
    // Initialize chat service
    const chatService = new window.ChatService({
      authMode: 'public'
    });
    
    // Initialize chat widget
    window.aiSupportChat = new window.AISupportChatWidget({
      chatService: chatService,
      getCaptchaToken: window.getChatCaptchaToken,
      inputId: 'entryTextarea',
      replyContainerId: 'reply',
      submitButtonId: 'entrySubmitBtn'
    });
  }
});