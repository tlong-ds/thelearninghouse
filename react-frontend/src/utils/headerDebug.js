// Header visibility debugging utility
export const startHeaderMonitoring = () => {
  const checkHeaderVisibility = () => {
    const header = document.querySelector('.app-header');
    if (!header) {
      console.warn('🔴 Header element not found in DOM');
      return;
    }

    const computedStyle = window.getComputedStyle(header);
    const isVisible = computedStyle.display !== 'none' && 
                      computedStyle.visibility !== 'hidden' && 
                      computedStyle.opacity !== '0';

    const rect = header.getBoundingClientRect();
    const isInViewport = rect.top >= 0 && rect.left >= 0 && 
                         rect.bottom <= window.innerHeight && 
                         rect.right <= window.innerWidth;

    if (!isVisible) {
      console.error('🔴 Header is not visible!', {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: computedStyle.opacity,
        zIndex: computedStyle.zIndex,
        position: computedStyle.position,
        top: computedStyle.top,
        left: computedStyle.left,
        right: computedStyle.right
      });
    }

    if (!isInViewport && isVisible) {
      console.warn('🟡 Header is visible but outside viewport', {
        rect,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      });
    }

    if (isVisible && isInViewport) {
      console.log('🟢 Header is visible and in viewport');
    }
  };

  // Check immediately
  checkHeaderVisibility();

  // Monitor for changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' || mutation.type === 'childList') {
        setTimeout(checkHeaderVisibility, 100);
      }
    });
  });

  // Observe document changes
  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['style', 'class']
  });

  // Check on scroll and resize
  window.addEventListener('scroll', checkHeaderVisibility);
  window.addEventListener('resize', checkHeaderVisibility);

  // Check periodically
  const interval = setInterval(checkHeaderVisibility, 5000);

  return () => {
    observer.disconnect();
    window.removeEventListener('scroll', checkHeaderVisibility);
    window.removeEventListener('resize', checkHeaderVisibility);
    clearInterval(interval);
  };
};

export const forceHeaderVisibility = () => {
  const header = document.querySelector('.app-header');
  if (header) {
    header.style.display = 'flex !important';
    header.style.visibility = 'visible !important';
    header.style.opacity = '1 !important';
    header.style.zIndex = '999999 !important';
    header.style.position = 'fixed !important';
    console.log('🔧 Forced header visibility');
  }
};
