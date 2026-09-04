
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Inter, Source_Serif_4 } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster"
import { cn } from '@/lib/utils';
import { AppHeader } from '@/components/app-header';
import { AuthProvider } from '@/hooks/use-auth';
import { AuthGuard } from '@/components/auth-guard';
import { ThemeProvider } from '@/components/theme-provider';
import { AgendamentoAlarmListener } from '@/components/agendamento-alarm-listener';
import { PwaInstallListener } from '@/components/pwa-install-listener';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Fiscal-X | Inspect. Protect. Empower.',
  description: 'Sistema inteligente para gestão de fiscalização sanitária.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fiscal-X',
  },
  icons: {
    // Ícone próprio (escudo + check) gerado em tamanho real por resolução —
    // antes todos os tamanhos declarados apontavam pro mesmo JPEG grande da
    // ilustração completa (o navegador só reamostrava), e o favicon.ico
    // estático em src/app/favicon.ico tinha uma versão ainda mais antiga
    // gravada nos bytes, por isso a aba mostrava uma imagem desatualizada
    // mesmo depois de trocar o arquivo do logo. Query ?v= força os
    // navegadores/PWA a descartar qualquer cópia em cache.
    icon: [
      { url: '/app-icon-192.png?v=20260903', sizes: '192x192', type: 'image/png' },
      { url: '/app-icon-512.png?v=20260903', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=20260903',
    apple: '/app-icon-180.png?v=20260903',
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
          inter.variable,
          sourceSerif.variable
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
              <AgendamentoAlarmListener />
              <PwaInstallListener />
            </AuthGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
