import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WeatherTech OS',
  description: 'Roofing and painting operations dashboard for WeatherTech Roofing LLC and IHC Painting.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
