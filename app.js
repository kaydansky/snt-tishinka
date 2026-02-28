/**
 * Web page UX handler
 */

// Load all chat components
document.addEventListener('DOMContentLoaded', () => {
  // Initialize chat components - now handled by chat-init.js
  console.log('Chat module loaded');
  
  // Header menu toggle functionality
  const menuToggle = document.getElementById('headerMenuToggle');
  const headerDropdown = document.getElementById('headerDropdown');
  
  if (menuToggle && headerDropdown) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      headerDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!headerDropdown.contains(e.target) && e.target !== menuToggle) {
        headerDropdown.classList.remove('show');
      }
    });
    
    // Close dropdown when clicking on any menu item
    const menuItems = headerDropdown.querySelectorAll('.header-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', () => {
        headerDropdown.classList.remove('show');
      });
    });
  }
  
  // Theme switching functionality
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');
  const themeIcon = document.getElementById('themeIcon');
  
  if (toggleThemeBtn && themeIcon) {
    // Check for saved theme preference or default to system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    // Apply initial theme
    document.documentElement.setAttribute('data-theme', initialTheme);
    updateThemeIcon(initialTheme);
    
    // Toggle theme on button click
    toggleThemeBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    });
    
    // Update theme icon based on theme
    function updateThemeIcon(theme) {
      if (theme === 'dark') {
        themeIcon.className = 'bi bi-sun-fill';
      } else {
        themeIcon.className = 'bi bi-moon-fill';
      }
    }
  }
  
  // Share app functionality
  const shareAppBtn = document.getElementById('shareAppBtn');
  if (shareAppBtn) {
    shareAppBtn.addEventListener('click', async () => {
      // Close the dropdown menu
      if (headerDropdown) {
        headerDropdown.classList.remove('show');
      }
      
      // Use Web Share API if available
      if (navigator.share) {
        try {
          await navigator.share({
            title: document.title,
            text: 'Консультант по СНТ Тишинка',
            url: window.location.href
          });
        } catch (err) {
          // User cancelled the share dialog or there was an error
          if (err.name !== 'AbortError') {
            console.log('Не удалось поделиться:', err);
          }
        }
      } else {
        // Fallback for browsers that don't support Web Share API
        alert('Web Share API не поддерживается в вашем браузере. Пожалуйста, скопируйте URL вручную: ' + window.location.href);
      }
    });
  }
});
