"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface AppTitleContextType {
  title: string;
  setTitle: (title: string) => void;
}

const AppTitleContext = createContext<AppTitleContextType | undefined>(undefined);

export function AppTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("DataNav");

  // Update document.title when title changes
  useEffect(() => {
    document.title = title === "DataNav" ? "DataNav" : `${title} - DataNav`;
  }, [title]);

  return (
    <AppTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </AppTitleContext.Provider>
  );
}

export function useAppTitle() {
  const context = useContext(AppTitleContext);
  if (context === undefined) {
    throw new Error("useAppTitle must be used within an AppTitleProvider");
  }
  return context;
}
