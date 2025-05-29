import { useState, createContext, useContext, useCallback, useEffect } from 'react';

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);

  const startLoading = useCallback((message = 'Loading...', withProgress = false) => {
    setLoadingCount(prev => prev + 1);
    setLoading(true);
    setLoadingMessage(message);
    setShowProgress(withProgress);
    if (withProgress) setProgress(0);
  }, []);

  const stopLoading = useCallback(() => {
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
