import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import SwRegister from '@/components/SwRegister';

export const metadata = {
  title: 'Rite',
  description: 'Wellbeing ajandan — ritüeller, plan, gelişim.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default' as const, title: 'Rite' },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#2c2a24',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
