import { readFileSync } from 'node:fs'

export const ports = JSON.parse(
  readFileSync(new URL('./ports.json', import.meta.url), 'utf8')
)
