
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster"
import { cn } from '@/lib/utils';
import { AppHeader } from '@/components/app-header';
import { AuthProvider } from '@/hooks/use-auth';
import { AuthGuard } from '@/components/auth-guard';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'vigilanT | Inspect. Protect. Empower.',
  description: 'Sistema inteligente para gestão de fiscalização sanitária.',
  manifest: '/manifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'vigilanT',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#f1f5f9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen font-sans antialiased selection:bg-primary/10",
          inter.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            <AuthGuard>
              <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-human-warm text-slate-900 transition-colors duration-300">
                <AppHeader />
                <main className="flex flex-1 flex-col relative">
                  <div className="relative z-10 flex flex-col flex-1 p-4 sm:p-8">
                    {children}
                  </div>
                </main>
              </div>
              <Toaster />
            </AuthGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
