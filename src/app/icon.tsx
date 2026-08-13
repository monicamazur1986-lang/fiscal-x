import { ImageResponse } from 'next/og'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'edge'
export const size = { width: 512, height: 512 }
export const contentType = 'image/jpeg'

export default function Icon() {
  const logoPath = path.join(process.cwd(), 'public', 'logo-fiscalx-oficial.jpeg')
  const logoBuffer = fs.readFileSync(logoPath)
  const logoDataUri = `data:image/jpeg;base64,${logoBuffer.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        <img
          src={logoDataUri}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
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