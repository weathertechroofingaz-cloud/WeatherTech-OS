import type { Metadata, Viewport } from 'next';
import { getRegressionSideEffectSafety } from '../lib/deployment/regressionSafety';
import './globals.css';

export const metadata: Metadata = {
  title: 'WeatherTech OS',
  description: 'Premium roofing and painting operations platform for CRM, estimating, production, invoicing, and field teams.',
  applicationName: 'WeatherTech OS',
};

export const viewport: Viewport = {
  themeColor: '#6d28d9',
};

function getPublicSupabaseOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!configuredUrl) {
    return 'unconfigured';
  }

  try {
    return new URL(configuredUrl).origin.toLowerCase();
  } catch {
    return 'malformed';
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-wtos-supabase-origin={getPublicSupabaseOrigin()}
      data-wtos-crm-demo-fallback={
        process.env.NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK === 'true'
          ? 'disabled'
          : 'enabled'
      }
      data-wtos-provider-side-effects={getRegressionSideEffectSafety()}
    >
      <body>{children}</body>
    </html>
  );
}
