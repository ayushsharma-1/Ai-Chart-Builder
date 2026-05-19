import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Lens - AI Analytics',
  description: 'Ask questions. Get insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0A0A0F] text-[#F0F0FF] font-dm-sans antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
