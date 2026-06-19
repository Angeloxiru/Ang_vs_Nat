// Gera ícones PNG do PWA sem dependências externas (usa zlib nativo).
// Desenha um fundo índigo com um círculo claro e as letras "I4" estilizadas
// por blocos simples. Saída em public/icons/.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function pngFromRGBA(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// fundo gradiente índigo + círculo claro + "barra" tipo gráfico
function drawIcon(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = (maskable ? 0.32 : 0.4) * size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // gradiente diagonal índigo -> roxo
      const t = (x + y) / (2 * size)
      let R = Math.round(79 + t * (124 - 79)) // 4f -> 7c
      let G = Math.round(70 + t * (58 - 70))
      let B = Math.round(229 + t * (237 - 229))
      const d = Math.hypot(x - cx, y - cy)
      if (d < r) {
        // círculo claro
        R = 240; G = 245; B = 255
        // "barras" de gráfico em índigo dentro do círculo
        const bx = (x - (cx - r * 0.55)) / (r * 1.1)
        const heights = [0.45, 0.7, 0.95]
        const idx = Math.floor(bx * 3)
        if (bx >= 0 && bx < 1 && idx >= 0 && idx < 3) {
          const within = bx * 3 - idx
          if (within > 0.15 && within < 0.85) {
            const top = cy + r * 0.45 - heights[idx] * r * 0.9
            if (y >= top && y <= cy + r * 0.5) {
              R = 79; G = 70; B = 229
            }
          }
        }
      }
      rgba[i] = R; rgba[i + 1] = G; rgba[i + 2] = B; rgba[i + 3] = 255
    }
  }
  return pngFromRGBA(size, size, rgba)
}

writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192))
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512))
writeFileSync(join(outDir, 'icon-512-maskable.png'), drawIcon(512, true))

// favicon SVG
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <circle cx="32" cy="32" r="20" fill="#f0f5ff"/>
  <g fill="#4f46e5"><rect x="20" y="34" width="6" height="10"/><rect x="29" y="28" width="6" height="16"/><rect x="38" y="22" width="6" height="22"/></g>
</svg>`
writeFileSync(join(__dirname, '..', 'public', 'favicon.svg'), favicon)

console.log('Ícones gerados em public/icons/ e favicon.svg')
