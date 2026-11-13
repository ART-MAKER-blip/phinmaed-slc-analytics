import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PHINMAED Student Learning Analytics and Deliberation System',
  description: 'UI prototype for the PHINMA Education Student Learning Coordinators (SLC) grade review and deliberation process.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
