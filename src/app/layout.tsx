
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
import { AvisoAtualizacao } from '@/components/aviso-atualizacao';

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
    // Logo oficial (public/logo-fiscalx-oficial.jpeg — selo redondo com o
    // mascote e o texto "Fiscal-X"), redimensionada com ~20% de margem
    // branca em volta e centralizada em cada resolução — sem essa margem a
    // máscara circular/arredondada que Android e iOS aplicam por cima do
    // ícone cortava o anel externo do selo. Query ?v= força os
    // navegadores/PWA a descartar qualquer cópia em cache do ícone antigo
    // (um app já instalado no Android só pega o ícone novo se a pessoa
    // remover e reinstalar o atalho — o sistema grava esse ícone
    // localmente na instalação).
    icon: [
      { url: '/app-icon-192.png?v=20261001b', sizes: '192x192', type: 'image/png' },
      { url: '/app-icon-512.png?v=20261001b', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=20261001b',
    apple: '/app-icon-180.png?v=20261001b',
  },
};

export const viewport: Viewport = {
  themeColor: '#f1f5f9',
  width: 'device-width',
  initialScale: 1,
  // maximumScale: 1 + userScalable: false travava o pinch-to-zoom em toda
  // tela do sistema — quem precisasse ampliar um texto pequeno no celular
  // simplesmente não conseguia. Liberado até 5x, mantendo o zoom inicial
  // em 1x (não muda nada pra quem não tenta ampliar).
  maximumScale: 5,
  userScalable: true,
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
              <AvisoAtualizacao />
            </AuthGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
