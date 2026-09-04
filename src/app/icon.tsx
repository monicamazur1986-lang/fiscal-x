import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Ícone do app (aba do navegador, PWA, atalho instalado) — marca própria
// (escudo + check, cores da marca), não mais o recorte da ilustração
// completa do mascote (que tinha texto/traços finos ilegíveis em tamanho
// pequeno). A arte cheia do mascote continua em logo-fiscalx-oficial.jpeg,
// usada só em espaços grandes (login, etc.), não como ícone.
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
          background: '#0B3733',
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
