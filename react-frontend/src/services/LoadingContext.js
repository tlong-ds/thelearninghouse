import { useState, createContext, useContext, useCallback, useEffect, useRef } from 'react';

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const loadingTimerRef = useRef(null);

  const startLoading = useCallback((message = 'Loading...', withProgress = false) => {
    // Clear any existing timer
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
    }
    
    setLoadingCount(prev => prev + 1);
    
    // Add a small delay before showing loading screen to prevent flickering
    loadingTimerRef.current = setTimeout(() => {
      setLoading(true);
      setLoadingMessage(message);
      setShowProgress(withProgress);
      if (withProgress) setProgress(0);
    }, 150); // 150ms delay before showing loading
  }, []);

  const stopLoading = useCallback(() => {
    // Clear any pending loading timer
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    
    setLoadingCount(prev => {
      const newCount = prev - 1;
      if (newCount <= 0) {
        setLoading(false);
        setShowProgress(false);
        setProgress(0);
        setLoadingMessage('Loading...');
        return 0;
      }
      return newCount;
    });
  }, []);

  const updateProgress = useCallback((newProgress) => {
    if (showProgress) {
      setProgress(Math.min(100, Math.max(0, newProgress)));
    }
  }, [showProgress]);

  const updateMessage = useCallback((message) => {
    if (loading) {
      setLoadingMessage(message);
    }
  }, [loading]);

  // Expose loading functions to window for axios interceptors
  useEffect(() => {
    window.__loadingState = {
      startLoading,
      stopLoading,
      updateProgress,
      updateMessage
    };
    return () => {
      delete window.__loadingState;
    };
  }, [startLoading, stopLoading, updateProgress, updateMessage]);

  return (
    <LoadingContext.Provider value={{ 
      loading, 
      loadingMessage,
      showProgress,
      progress,
      startLoading, 
      stopLoading,
      updateProgress,
      updateMessage
    }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};
