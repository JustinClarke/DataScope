import { useState, type ReactNode } from "react";
import { EducationalPanelContext } from "./useEducationalPanel";

export function EducationalPanelProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [content, setContent] = useState<ReactNode>(null);

  return (
    <EducationalPanelContext.Provider value={{ content, setContent }}>
      {children}
    </EducationalPanelContext.Provider>
  );
}
