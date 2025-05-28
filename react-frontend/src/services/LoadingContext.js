import { useState, createContext, useContext, useCallback, useEffect } from 'react';

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);

  const startLoading = useCallback(() => {
    setLoadingCount(prev => prev + 1);
    setLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount(prev => {
      const newCount = prev - 1;
      if (newCount <= 0) {
        setLoading(false);
        return 0;
      }
      return newCount;
    });
  }, []);

  // Expose loading functions to window for axios interceptors
  useEffect(() => {
    window.__loadingState = {
      startLoading,
      stopLoading
    };
    return () => {
      delete window.__loadingState;
    };
  }, [startLoading, stopLoading]);

  return (
    <LoadingContext.Provider value={{ loading, startLoading, stopLoading }}>
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
