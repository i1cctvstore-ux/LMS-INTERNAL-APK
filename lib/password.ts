// Generator password sederhana untuk keperluan preview.
// Di produksi, password sebaiknya dibuat & di-hash di sisi server.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const SYMBOLS = '!@#$%*?'

export function generatePassword(length = 12): string {
  const pool = CHARS + SYMBOLS
  let out = ''
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : undefined

  if (cryptoObj?.getRandomValues) {
    const values = new Uint32Array(length)
    cryptoObj.getRandomValues(values)
    for (let i = 0; i < length; i++) {
      out += pool[values[i] % pool.length]
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += pool[Math.floor(Math.random() * pool.length)]
    }
  }
  return out
}
