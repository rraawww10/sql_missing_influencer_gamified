import type { ReactNode } from 'react';
import { themeVars } from '../theme';

// Applies a session's colours (sky + accent) to everything inside
export function ThemeScope({ session, children }: { session: number; children: ReactNode }) {
  return <div className="themed" style={themeVars(session) as React.CSSProperties}>{children}</div>;
}
