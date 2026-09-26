
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// SSRF: esta rota fazia fetch() de QUALQUER url= informada pelo cliente, sem
// autenticação nem restrição de domínio, devolvendo o conteúdo de volta com
// CORS liberado — um proxy aberto que permitia usar o servidor pra acessar
// endereços internos/privados (metadados de nuvem, rede interna, etc.) ou só
// abusar da infraestrutura como redirecionador anônimo. Essa rota só existe
// pra buscar brasões municipais já hospedados no Firebase Storage (ver
// admin/configuracoes/page.tsx — o upload sempre gera uma getDownloadURL()
// desses domínios), então restringimos ao host esperado.
const ALLOWED_IMAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

/**
 * FALLBACK "EM BRANCO" — pixel transparente, não uma imagem/marca real.
 * Este proxy só é chamado quando o cliente JÁ tem um brasão municipal
 * configurado (config.logoUrl); se o Storage estiver indisponível e o
 * download falhar, é melhor não mostrar nenhuma imagem do que mostrar uma
 * marca errada (ex.: o mascote do sistema) no lugar do brasão do município.
 */
/**
 * `X-Proxy-Fallback` avisa quem sabe ler cabeçalho que isto NÃO é o arquivo
 * pedido — um `<img>` de brasão ignora silenciosamente (é exatamente o
 * degrade gracioso que este proxy nasceu para dar), mas o merge de anexo do
 * PDF do PAS (generate-pas-pdf.ts) passou a checar este cabeçalho: sem ele,
 * um Storage temporariamente fora do ar devolvia este pixel como se fosse o
 * documento anexado de verdade — `resp.ok` (200) não detectava nada, e o
 * anexo entrava nos autos como uma imagem em branco invisível, sem aviso
 * nenhum, em vez do "não pôde ser incluído" que o resto do código já sabe
 * mostrar.
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
      'X-Proxy-Fallback': '1',
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

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return fallbackImage();
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
      console.warn('Proxy de imagem recusado — host fora da lista permitida:', parsed.hostname);
      return fallbackImage();
    }

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
    if (!response.body) throw new Error('Resposta sem corpo.');

    const contentType = response.headers.get('Content-Type') || 'image/jpeg';

    // Repassa o corpo como STREAM, não como um `arrayBuffer()` inteiro na
    // memória de uma vez. Um anexo de PAS (relatório escaneado, por
    // exemplo) passa fácil de 30 MB — bufferizar a resposta inteira antes
    // de devolver batia num teto de tamanho da própria infraestrutura
    // (Cloud Run/App Hosting) para respostas não streamadas: o cliente
    // recebia os primeiros ~32 MB e nada mais, sem erro nenhum sinalizado
    // aqui — só um PDF truncado do outro lado, que o pdf.js rejeitava como
    // "Invalid PDF structure" (mensagem "documento não pôde ser incluído").
    return new NextResponse(response.body, {
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
