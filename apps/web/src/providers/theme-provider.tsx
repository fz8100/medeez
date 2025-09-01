'use client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  disableTransitionOnChange = false,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const root = document.documentElement;
    
    if (disableTransitionOnChange) {
      root.style.transition = 'none';
    }

    root.classList.remove('light', 'dark');

    let systemTheme: Theme = 'light';
    if (theme === 'system' && enableSystem) {
      systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    const appliedTheme = theme === 'system' ? systemTheme : theme;
    root.classList.add(appliedTheme);

    if (disableTransitionOnChange) {
      // Force reflow
      root.offsetHeight;
      root.style.transition = '';
    }
  }, [theme, enableSystem, disableTransitionOnChange]);

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme;
    if (stored) {
      setThemeState(stored);
    }
  }, []);

  const setTheme = (theme: Theme) => {
    setThemeState(theme);
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      // Ignore localStorage errors
    }
  };

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value} {...props}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};