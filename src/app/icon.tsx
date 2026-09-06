import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Ícone do app (aba do navegador, PWA, atalho instalado) — mascote colorido
// original sobre fundo branco, com moldura arredondada em verde
// institucional padrão (#0E4A44), já embutido em app-icon-512.png. O fundo
// aqui só aparece se a imagem não cobrir 100% da moldura; mantido em branco
// por consistência. Ver public/app-icon-*.png (script de geração não
// versionado, ver histórico de conversa).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFFFFF',
          overflow: 'hidden',
        }}
      >
        <img
          src="/app-icon-512.png"
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  )
}
