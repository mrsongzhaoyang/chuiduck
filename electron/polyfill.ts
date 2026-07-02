import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const filename = fileURLToPath(import.meta.url)
const dirname_ = dirname(filename)

;(globalThis as typeof globalThis & { __filename: string; __dirname: string }).__filename = filename
;(globalThis as typeof globalThis & { __filename: string; __dirname: string }).__dirname = dirname_
