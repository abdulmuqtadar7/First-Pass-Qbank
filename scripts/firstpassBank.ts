import type { Plugin } from 'vite'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const dataDir = resolve(process.cwd(), 'src/data')
const publicDir = resolve(process.cwd(), 'public')

// Read-only access to src/data/*.json. Generated files live in public/ instead.
function buildCompressedBank(): void {
  const entries: { name: string; raw: unknown }[] = []
  if (existsSync(dataDir)) {
    for (const name of readdirSync(dataDir).filter((file) => file.endsWith('.json')).sort()) {
      entries.push({ name, raw: JSON.parse(readFileSync(join(dataDir, name), 'utf8').replace(/^\uFEFF/, '')) })
    }
  }
  const json = JSON.stringify({ files: entries })
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(join(publicDir, 'firstpass-bank.fpb'), gzipSync(json, { level: 7 }))
  // Compatibility fallback for older browsers without DecompressionStream.
  writeFileSync(join(publicDir, 'firstpass-bank.json'), json)
}

export function firstpassCompressedBank(): Plugin {
  // Generate the package before Vite scans public/ for static assets.
  buildCompressedBank()
  return {
    name: 'firstpass-compressed-full-bank',
    configureServer(server) {
      const refresh = (file: string) => {
        if (file.startsWith(dataDir) && file.endsWith('.json')) {
          buildCompressedBank()
          server.ws.send({ type: 'full-reload' })
        }
      }
      server.watcher.on('add', refresh)
      server.watcher.on('change', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}
