import { useEffect, type ReactNode } from 'react';
import { themeVars } from '../theme';
import { setSoundTheme, startAmbient } from '../sound';

// Applies a session's two colours (--c1 / --c2) and its sound palette to everything inside
export function ThemeScope({ session, children }: { session: number; children: ReactNode }) {
  useEffect(() => { setSoundTheme(session); startAmbient(); }, [session]);
  return <div className={`themed theme-s${session}`} data-session={session} style={themeVars(session) as React.CSSProperties}>{children}</div>;
}
