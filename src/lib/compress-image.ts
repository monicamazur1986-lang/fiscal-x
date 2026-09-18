'use client';

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

// Navegadores em geral não decodificam HEIC/HEIF (formato padrão da câmera do
// iPhone) via <img>/canvas — sem essa conversão prévia pra JPEG, o anexo
// falhava (antes travava para sempre; ver o timeout abaixo).
async function convertHeicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(converted) ? converted[0] : converted;
}

function decodeAndResize(source: Blob, maxDimension: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(source);

    // Em formatos que o navegador não sabe decodificar, nem onload nem
    // onerror disparam — sem esse timeout, a Promise fica pendurada pra
    // sempre e trava o botão de anexar num loop de carregamento infinito,
    // sem toast de sucesso nem de erro.
    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível processar essa imagem (formato não suportado pelo navegador).'));
    }, 15000);

    img.onload = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas não suportado.'));
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao comprimir imagem.'));
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao carregar imagem.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Redimensiona e comprime uma imagem no navegador (canvas) antes de enviar —
 * reduz o tamanho tanto para upload no Storage (mais rápido em conexão de
 * campo) quanto para o fallback em base64 direto no Firestore (que tem teto
 * de 1MB por documento). Converte HEIC/HEIF para JPEG antes, se necessário.
 */
export async function compressImage(file: File, maxDimension = 1280, quality = 0.7): Promise<Blob> {
  let source: File | Blob = file;
  if (isHeic(file)) {
    try {
      source = await convertHeicToJpeg(file);
    } catch {
      throw new Error('Não foi possível converter essa imagem HEIC.');
    }
  }
  return decodeAndResize(source, maxDimension, quality);
}


/**
 * COMPRESSÃO COM ORÇAMENTO DE BYTES — para a foto que vai EMBUTIDA no
 * documento, e não para o Storage.
 *
 * São dois destinos com exigências opostas. No Storage a foto é um arquivo à
 * parte: pode ter 300 KB sem incomodar ninguém, e vale manter a qualidade,
 * porque ela é prova em processo sanitário. Embutida, ela vira texto base64
 * DENTRO da vistoria — cada byte da imagem ocupa ~1,33 byte no documento, e o
 * documento tem teto de 1 MiB no Firestore.
 *
 * A conta que importa: com ~80 KB por foto, o base64 dá ~107 KB, e seis fotos
 * somam ~640 KB — cabem junto com o resto da vistoria. Na compressão de
 * sempre (1280px, q0.7), duas fotos já podem estourar o documento inteiro.
 *
 * Estourar não falha só aquela gravação: a fila do SDK é FIFO, e uma gravação
 * que o servidor nunca aceita segura todas as outras até o aparelho parar de
 * salvar (ver a trava de tamanho em use-inspecoes.ts).
 *
 * As tentativas descem em dimensão E qualidade juntas. Só reduzir a qualidade
 * deixa a foto borrada mantendo o tamanho da tela; reduzir os dois preserva
 * melhor o que importa numa foto de fiscalização — ler um rótulo, enxergar
 * sujidade num equipamento.
 */
const TENTATIVAS_EMBUTIDA: { dimensao: number; qualidade: number }[] = [
  { dimensao: 1280, qualidade: 0.7 },
  { dimensao: 1024, qualidade: 0.6 },
  { dimensao: 900, qualidade: 0.5 },
  { dimensao: 720, qualidade: 0.45 },
  { dimensao: 600, qualidade: 0.4 },
  { dimensao: 480, qualidade: 0.35 },
];

/** Orçamento por foto embutida. Ver a conta no comentário acima. */
export const ORCAMENTO_FOTO_EMBUTIDA = 80 * 1024;

export async function compressImageToBudget(
  file: File,
  maxBytes = ORCAMENTO_FOTO_EMBUTIDA,
): Promise<{ blob: Blob; coube: boolean; bytes: number }> {
  let source: File | Blob = file;
  if (isHeic(file)) {
    try {
      source = await convertHeicToJpeg(file);
    } catch {
      throw new Error('Não foi possível converter essa imagem HEIC.');
    }
  }

  let ultimo: Blob | null = null;
  for (const { dimensao, qualidade } of TENTATIVAS_EMBUTIDA) {
    const blob = await decodeAndResize(source, dimensao, qualidade);
    ultimo = blob;
    if (blob.size <= maxBytes) return { blob, coube: true, bytes: blob.size };
  }

  // Nem no menor ajuste coube. Devolve mesmo assim, com o aviso: uma foto
  // menor que o ideal ainda é melhor do que perder a prova, e quem chama
  // decide o que dizer ao fiscal.
  const blob = ultimo!;
  return { blob, coube: false, bytes: blob.size };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao converter imagem.'));
    reader.readAsDataURL(blob);
  });
}
