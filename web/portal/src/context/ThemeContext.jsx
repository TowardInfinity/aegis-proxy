import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = {
  SAFFRON: 'saffron',
  LIGHT: 'light',
  DARK: 'dark',
  MIDNIGHT: 'midnight'
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('ai_guardian_theme');
      if (savedTheme && Object.values(THEMES).includes(savedTheme)) {
        return savedTheme;
      }
    } catch (e) {
      // Ignore localStorage access issues
    }
    return THEMES.SAFFRON;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('ai_guardian_theme', theme);
    } catch (e) {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === THEMES.SAFFRON) return THEMES.LIGHT;
      if (prev === THEMES.LIGHT) return THEMES.DARK;
      return THEMES.SAFFRON;
    });
  };

  const isDark = theme !== THEMES.LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
