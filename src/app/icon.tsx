import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Ícone do app (aba do navegador, PWA, atalho instalado) — recorte
// quadrado do próprio mascote oficial (logo-fiscalx-oficial.jpeg), sem a
// faixa de texto "FISCAL-X" do rodapé da arte original (ilegível em
// tamanho pequeno). Gerado por src/app/favicon.ico e public/app-icon-*.png
// (ver histórico de conversa/commits pra o script que faz o recorte).
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
