import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WeatherTech OS',
  description: 'Premium roofing and painting operations platform for CRM, estimating, production, invoicing, and field teams.',
  applicationName: 'WeatherTech OS',
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
