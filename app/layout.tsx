import type { Metadata } from 'next';
import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Enterprise ERP';

export const metadata: Metadata = {
  title: `${appName} | Inventory System`,
  description: 'Enterprise inventory distribution, multi-location stock viewer and stock movement ledger',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
