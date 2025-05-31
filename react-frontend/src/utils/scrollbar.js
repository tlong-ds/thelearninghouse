// Utility functions for handling scrollbar width detection

/**
 * Calculate the width of the browser's scrollbar
 * @returns {number} Scrollbar width in pixels
 */
export const getScrollbarWidth = () => {
  // Create a temporary div to measure scrollbar width
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.overflow = 'scroll'; // forcing scrollbar to appear
  outer.style.msOverflowStyle = 'scrollbar'; // needed for WinJS apps
  document.body.appendChild(outer);

  // Create an inner div
  const inner = document.createElement('div');
  outer.appendChild(inner);

  // Calculate the difference between the outer and inner widths
  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;

  // Clean up
  outer.parentNode.removeChild(outer);

  return scrollbarWidth;
};

/**
 * Set CSS custom property for scrollbar width
 */
export const setScrollbarWidth = () => {
  const scrollbarWidth = getScrollbarWidth();
  document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
  return scrollbarWidth;
};

/**
 * Check if the page has a vertical scrollbar
 * @returns {boolean} True if page has vertical scrollbar
 */
export const hasVerticalScrollbar = () => {
  return document.body.scrollHeight > window.innerHeight;
};

/**
 * Update header positioning based on scrollbar presence
 */
export const updateHeaderForScrollbar = () => {
  const hasScrollbar = hasVerticalScrollbar();
  const scrollbarWidth = hasScrollbar ? getScrollbarWidth() : 0;
  
  document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
  document.documentElement.style.setProperty('--has-scrollbar', hasScrollbar ? '1' : '0');
  
  return { hasScrollbar, scrollbarWidth };
};
