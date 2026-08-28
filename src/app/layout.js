import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ThemeProvider } from '@/components/shell/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata = {
  title: 'IF Cares Regular Year',
  description: 'Daily meal counts for the IF Cares Regular Year program',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sites use cheap tablets; let staff zoom if they need to.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

// Runs before first paint so a dark-mode session never flashes white.
const themeScript = `(function(){try{var t=localStorage.getItem('ifc.theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
