
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * FALLBACK "EM BRANCO" — pixel transparente, não uma imagem/marca real.
 * Este proxy só é chamado quando o cliente JÁ tem um brasão municipal
 * configurado (config.logoUrl); se o Storage estiver indisponível e o
 * download falhar, é melhor não mostrar nenhuma imagem do que mostrar uma
 * marca errada (ex.: o mascote do sistema) no lugar do brasão do município.
 */
function fallbackImage() {
  const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  return new NextResponse(transparentPixel, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

/**
 * PROXY DE DADOS BINÁRIOS COM SUPORTE A CORS
 * Atua como um túnel para entregar a imagem com cabeçalhos de acesso liberado (*),
 * essencial para ferramentas de geração de PDF como html2canvas.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // searchParams.get() já decodifica o parâmetro uma vez — chamar
    // decodeURIComponent() de novo aqui decodificava duas vezes, virando o
    // %2F (barra codificada, parte legítima do caminho do arquivo no
    // Storage, ex.: municipios%2Fprudentopolis%2Fshield_...) numa barra "/"
    // de verdade e quebrando a URL de download da imagem.
    const rawUrl = searchParams.get('url');
    const targetUrl = (rawUrl && rawUrl !== 'undefined' && rawUrl !== 'null' && rawUrl !== '')
      ? rawUrl.trim()
      : null;

    // Se for um Data URL (Base64), não precisamos de proxy, retorna erro para o cliente usar direto
    if (targetUrl?.startsWith('data:')) {
      return new NextResponse('Data URLs should be handled on client side', { status: 400 });
    }

    if (!targetUrl) return fallbackImage();

    return await fetchImage(targetUrl);
  } catch (error) {
    console.error('Proxy Request Parsing Error:', error);
    return fallbackImage();
  }
}

async function fetchImage(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`Falha no download: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'image/jpeg';

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Proxy Error for URL:', url, error);
    return fallbackImage();
  }
}
