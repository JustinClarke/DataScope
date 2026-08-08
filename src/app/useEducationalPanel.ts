import { createContext, useContext } from "react";

interface EducationalPanelContextType {
  content: React.ReactNode;
  setContent: (content: React.ReactNode) => void;
}

export const EducationalPanelContext =
  createContext<EducationalPanelContextType | null>(null);

export function useEducationalPanel(): EducationalPanelContextType {
  const context = useContext(EducationalPanelContext);
  if (!context) {
    throw new Error(
      "useEducationalPanel must be used within EducationalPanelProvider",
    );
  }
  return context;
}
