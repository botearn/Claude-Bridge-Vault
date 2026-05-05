import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')
const upstream = process.env.VITE_REACT_APP_SERVER_URL?.trim().replace(/\/+$/, '')

mkdirSync(distDir, { recursive: true })

const lines = []

if (upstream) {
  for (const prefix of ['/api', '/mj', '/pg']) {
    lines.push(`${prefix}/* ${upstream}${prefix}/:splat 200`)
  }
} else {
  console.warn(
    '[netlify] VITE_REACT_APP_SERVER_URL is not set; only SPA fallback rules will be generated.'
  )
}

lines.push('/* /index.html 200')

writeFileSync(path.join(distDir, '_redirects'), `${lines.join('\n')}\n`)
