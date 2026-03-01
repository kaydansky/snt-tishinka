/**
 * Turnstile CAPTCHA handling for AI chat widget.
 * Handles widget render/execute, mask show/hide, token promise API.
 */

const DEFAULT_TURNSTILE_SITEKEY = 'YOUR_PUBLIC_KEY_HERE'; // Replace with your actual Turnstile site key or ensure it's set in APP_CONFIG

let chatTurnstileWidgetId = null;
let pendingCaptchaResolve = null;
let pendingCaptchaReject = null;
let turnstileRendered = false;
let preloadedCaptchaToken = null;

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
  if (!container) return;

  const mask = getCaptchaMask();
  mask.style.display = 'block';

  container.style.position = 'fixed';
  container.style.top = '50%';
  container.style.left = '50%';
  container.style.transform = 'translate(-50%, -50%)';
  container.style.visibility = 'visible';
  container.style.pointerEvents = 'auto';
  container.style.display = 'flex';
  container.style.opacity = '1';

  // Ensure light theme for Turnstile visibility
  if (document.documentElement.classList.contains('dark-theme')) {
    container.style.boxShadow = '0 2px 10px rgba(255,255,255,0.2)';
  } else {
    container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  }
}

function hideTurnstileChallenge(container) {
  if (!container) return;

  const mask = document.getElementById('captcha-mask');
  if (mask) {
    mask.style.display = 'none';
  }

  // Fully hide widget UI until the next challenge execution.
  container.style.pointerEvents = 'none';
  container.style.visibility = 'hidden';
  container.style.opacity = '0';
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
  console.debug('renderTurnstileWidget called, turnstile present:', !!window.turnstile);
  if (!window.turnstile) return false;

  const container = getTurnstileContainer();
  if (!container) return false;

  if (turnstileRendered && chatTurnstileWidgetId !== null) return true;

  try {
    chatTurnstileWidgetId = window.turnstile.render('#chat-turnstile', {
      sitekey: resolveTurnstileSitekey(),
      size: 'normal',
      theme: document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light',
      execution: 'render', // Render only, don't execute immediately
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
    console.info('Turnstile rendered, widgetId=', chatTurnstileWidgetId);
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
    // Show Turnstile widget on page load
    const container = getTurnstileContainer();
    if (container && turnstileRendered && chatTurnstileWidgetId !== null) {
      showTurnstileChallenge(container);
    }
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
  console.info('Turnstile loaded and widget initialized');
};

window.getChatCaptchaToken = function getChatCaptchaToken() {
  // Return cached preloaded token if available (consumed once).
  if (preloadedCaptchaToken) {
    const token = preloadedCaptchaToken;
    preloadedCaptchaToken = null;
    return Promise.resolve(token);
  }

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
        // Execute the Turnstile widget to get a token
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