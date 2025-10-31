// apps/backend/scripts/module-check.ts
import fs from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC = resolve(__dirname, '..', 'src')

function pathFor(modulePathNoExt: string): string {
  const ts = resolve(SRC, `${modulePathNoExt}.ts`)
  const js = resolve(SRC, `${modulePathNoExt}.js`)
  if (fs.existsSync(ts)) return pathToFileURL(ts).href
  if (fs.existsSync(js)) return pathToFileURL(js).href
  throw new Error(`Not found: ${modulePathNoExt}.(ts|js) under ${SRC}`)
}

let failed = false
function ok(msg: string) { console.log(`✅ ${msg}`) }
function fail(msg: string, e: unknown) {
  failed = true
  const m = e instanceof Error ? e.message : String(e)
  console.error(`❌ ${msg}: ${m}`)
}

async function checkDefaultRouter(p: string) {
  try {
    const mod = await import(pathFor(p))
    if (!('default' in mod)) throw new Error('default export missing')
    if (typeof (mod as any).default !== 'function' && typeof (mod as any).default?.use !== 'function') {
      throw new Error('default export is not an express.Router')
    }
    ok(`router ${p}`)
  } catch (e) { fail(`router ${p}`, e) }
}

async function checkFnExport(p: string, name: string) {
  try {
    const mod = await import(pathFor(p))
    if (typeof (mod as any)[name] !== 'function') {
      throw new Error(`export ${name} not found or not a function`)
    }
    ok(`export ${name} in ${p}`)
  } catch (e) { fail(`export ${name} in ${p}`, e) }
}

async function main() {
  const routers = [
    'routes/campaigns',
    'routes/briefs',
    'routes/framing',
    'routes/core-evaluate',
    'routes/core-create',
    'routes/core-synthesis',
    'routes/export-artifacts',
    'routes/ask-outputs',
    'routes/heuristics',
    'routes/outputs-latest',
  ]
  const orchestrators: Array<[string, string]> = [
    ['lib/orchestrator/framing', 'runFraming'],
    ['lib/orchestrator/evaluate', 'runEvaluate'],
    ['lib/orchestrator/create', 'runCreate'],
    ['lib/orchestrator/synthesis', 'runSynthesis'],
    ['lib/openai', 'chat'],
    ['lib/copydesk', 'composeConsultantFromJSON'],
    ['lib/copydesk', 'composeConsultantRoutes'],
  ]

  for (const r of routers) await checkDefaultRouter(r)
  for (const [p, name] of orchestrators) await checkFnExport(p, name)

  if (failed) {
    console.error('❌ Module check failed')
    process.exit(1)
  } else {
    console.log('✅ Module exports look good')
  }
}

main().catch((e) => {
  fail('checker crashed', e)
  process.exit(1)
})
