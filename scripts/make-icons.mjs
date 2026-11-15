import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size)
      const offset = row + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function paint(x, y, size) {
  const margin = size * 0.08
  const inside = x > margin && y > margin && x < size - margin && y < size - margin
  if (!inside) return [0, 0, 0, 0]
  const fold = size * 0.28
  const foldX = size - margin - fold
  if (x > foldX && y < margin + fold && x - foldX + (y - margin) < fold) {
    if (x - foldX + (y - margin) > fold - Math.max(1, size * 0.05)) return [26, 35, 48, 255]
    return [228, 216, 196, 255]
  }
  const border = Math.max(1, size * 0.045)
  if (x < margin + border || y < margin + border || x > size - margin - border || y > size - margin - border) {
    return [26, 35, 48, 255]
  }
  for (const ratio of [0.42, 0.55, 0.68]) {
    if (Math.abs(y - size * ratio) < Math.max(1, size * 0.02) && x > size * 0.22 && x < size * 0.7) {
      return [26, 35, 48, 255]
    }
  }
  const cx = size * 0.74
  const cy = size * 0.72
  const radius = size * 0.1
  if ((x - cx) ** 2 + (y - cy) ** 2 < radius * radius) return [142, 30, 36, 255]
  return [244, 240, 230, 255]
}

mkdirSync('public/icons', { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon-${size}.png`, png(size, paint))
}
