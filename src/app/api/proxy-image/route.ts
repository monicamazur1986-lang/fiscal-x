
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * URL PERMANENTE DO SÍMBOLO MUNICIPAL DE PRUDENTÓPOLIS
 */
const OFFICIAL_LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

/**
 * PROXY DE DADOS BINÁRIOS COM SUPORTE A CORS
 * Atua como um túnel para entregar a imagem com cabeçalhos de acesso liberado (*),
 * essencial para ferramentas de geração de PDF como html2canvas.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url');
    
    // Decodifica e limpa a URL do alvo
    const targetUrl = (rawUrl && rawUrl !== 'undefined' && rawUrl !== 'null' && rawUrl !== '') 
      ? decodeURIComponent(rawUrl).trim() 
      : OFFICIAL_LOGO_URL;

    // Se for um Data URL (Base64), não precisamos de proxy, retorna erro para o cliente usar direto
    if (targetUrl.startsWith('data:')) {
      return new NextResponse('Data URLs should be handled on client side', { status: 400 });
    }

    return await fetchImage(targetUrl);
  } catch (error) {
    console.error('Proxy Request Parsing Error:', error);
    return fetchImage(OFFICIAL_LOGO_URL);
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
    
    // Fallback recursivo seguro: Tenta o logo oficial se o URL do usuário falhar
    if (url !== OFFICIAL_LOGO_URL) {
      return fetchImage(OFFICIAL_LOGO_URL);
    }
    
    // Se até o oficial falhar, retorna um pixel transparente em GIF
    const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    return new NextResponse(transparentPixel, {
      status: 200,
      headers: { 
        'Content-Type': 'image/gif', 
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      },
    });
  }
}
