import type {NextConfig} from 'next';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Versão publicada, gravada por scripts/gravar-versao.mjs no prebuild.
 *
 * É lida do MESMO arquivo que o navegador consulta em tempo de execução, e não
 * gerada aqui com Date.now(): o next.config é avaliado mais de uma vez (build e
 * inicialização do servidor), então um valor novo a cada avaliação faria o app
 * anunciar atualização para sempre.
 */
function versaoPublicada(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'versao.json'), 'utf8')).build || 'dev';
  } catch {
    return 'dev';
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: versaoPublicada(),
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'prudentopolis.pr.gov.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'brasilapi.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Indicador de desenvolvimento do Next.js (bolinha "N" no canto) — só
  // aparece com `npm run dev`, nunca em produção; desligado por ser só ruído
  // visual durante os testes.
  devIndicators: false,

  /**
   * POR QUE TROCA DE LOGO/ÍCONE DEMORAVA A APARECER NOS APARELHOS
   *
   * Nada aqui é servido pelo service worker (o nosso só trata notificação, não
   * faz cache) e o bundle do Next já vem com hash no nome, então esses dois não
   * eram o problema. O que ficava preso era o punhado de arquivos estáticos de
   * `public/` — manifest.json e os PNG de ícone — que saíam com o cache padrão
   * do navegador e podiam ficar horas sem ser revalidados.
   *
   * `must-revalidate` com `max-age=0` faz o navegador perguntar ao servidor a
   * cada carga; quando nada mudou, a resposta é um 304 (poucos bytes), então o
   * custo é baixo e a troca aparece na primeira abertura seguinte.
   *
   * Isso NÃO alcança o ícone que o sistema operacional já copiou na hora de
   * instalar o app — esse só troca reinstalando. Por isso os ícones continuam
   * com `?v=` no manifest: mudar essa marca faz o aparelho tratar como arquivo
   * novo.
   */
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/:icone(app-icon-.*\\.png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/logo-fiscalx-oficial.jpeg',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // Carimbo da versão: precisa vir sempre do servidor, nunca do cache —
        // é justamente ele que responde "saiu versão nova?".
        source: '/versao.json',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
