import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const ReceberActionsContext = createContext<HTMLDivElement | null>(null);

export function ReceberActions({ children }: { children: ReactNode }) {
  const container = useContext(ReceberActionsContext);
  return container ? createPortal(children, container) : children;
}
