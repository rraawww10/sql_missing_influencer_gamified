import { useEffect, type ReactNode } from 'react';
import { themeVars } from '../theme';
import { setSoundTheme, startAmbient } from '../sound';
import { Particles } from './Particles';

// Applies a session's colours (sky + accent), its sound palette, and its floating particles to everything inside
export function ThemeScope({ session, children }: { session: number; children: ReactNode }) {
  useEffect(() => { setSoundTheme(session); startAmbient(); }, [session]);
  return (
    <div className={`themed theme-s${session}`} data-session={session} style={themeVars(session) as React.CSSProperties}>
      <Particles session={session} />
      {children}
    </div>
  );
}
