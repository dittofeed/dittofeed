import { createContext, useContext, useState, useEffect } from "react";

const ThemeModeContext = createContext();

export const ThemeModeProvider = ({ children }) => {
  const envTheme = process.env.NEXT_PUBLIC_DITTOFEED_THEME || "default";
  

  const [mode, setMode] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (envTheme !== "default") {
      setMode(envTheme);
    } else {
      const stored = localStorage.getItem("theme-mode");
      setMode(stored || "system");
    }
    setIsInitialized(true);
  }, [envTheme]);

  const updateMode = (newMode) => {
    if (envTheme !== "default") return; 
    setMode(newMode);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme-mode", newMode);
    }
  };


  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeModeContext.Provider value={{ mode, updateMode, envTheme }}>
      {children}
    </ThemeModeContext.Provider>
  );
};

export const useThemeMode = () => {
  const context = useContext(ThemeModeContext);
  if (context === undefined) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return context;
};