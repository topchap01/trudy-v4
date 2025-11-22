#!/usr/bin/env tsx
import process from 'node:process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'module'
import puppeteer from 'puppeteer'
import { prisma } from '../src/db/prisma.js'
import { collectExportSnapshot } from '../src/export/snapshot.js'
import { renderClientDeck } from '../src/export/render-html.js'
import type { SummaryModel } from '../src/export/render-html.js'
import { runJudge } from '../src/lib/orchestrator/judge.js'
import { writeCampaignMemory } from '../src/lib/memory-store.js'
import type { ExportOptions } from '../src/export/types.js'
import { slug } from '../src/export/utils.js'
import { exportDocxFromSummary } from '../src/docx/exportDocx.js'
import { proofreadHtml } from '../src/lib/proofreader.js'

const require = createRequire(import.meta.url)
let pagedCliPath: string | null = null
try {
  pagedCliPath = require.resolve('pagedjs-cli/src/cli.js')
} catch {
  pagedCliPath = null
}

type Format = 'PDF' | 'HTML' | 'DOCX' | 'BOTH' | 'ALL'

async function main() {
  const campaignId = process.argv[2]
  if (!campaignId) {
    console.error('Usage: pnpm --filter @trudy/backend exec tsx scripts/run-export.ts <campaignId> [format]')
    process.exit(1)
  }
  const formatArg = (process.argv[3] || 'BOTH').toUpperCase()
  const allowedFormats: Format[] = ['PDF', 'HTML', 'DOCX', 'BOTH', 'ALL']
  const format: Format = allowedFormats.includes(formatArg as Format) ? (formatArg as Format) : 'BOTH'

  const options: ExportOptions = { format, sections: {}, theme: {} }
  const snapshot = await collectExportSnapshot(campaignId, options.sections || {})
  const judgeVerdict = await runJudge(snapshot.context, {
    useLLM: (process.env.JUDGE_LLM_DEFAULT === '1') || false,
    baselineResearch: snapshot.framingMeta?.research ?? null,
    inputs: {
      framing: snapshot.judgeInputs.framing,
      evaluation: snapshot.judgeInputs.evaluation,
      opinion: snapshot.judgeInputs.opinion,
      strategist: snapshot.judgeInputs.strategist,
      exportSummary: '',
    },
  })

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  let { html, title, model } = renderClientDeck(snapshot, {
    sections: options.sections || {},
    theme: options.theme || {},
    judgeVerdict,
    timestamp,
  })
  html = await proofreadHtml(html, { scope: 'export', campaignId: snapshot.campaign.id })

  if (model.governance.blockers.length) {
    throw new Error(`Export blocked by governance: ${model.governance.blockers.join(', ')}`)
  }

  const dir = ensureExportDir(snapshot.campaign.id)
  const baseFile = buildArtifactBase(snapshot.campaign.title || snapshot.campaign.id)

  const htmlArtifact = await persistHtmlArtifact({
    campaignId: snapshot.campaign.id,
    dir,
    baseFile,
    html,
  })

  let pdfArtifact: { id: string } | null = null
  if (format === 'PDF' || format === 'BOTH' || format === 'ALL') {
    pdfArtifact = await persistPdfArtifact({
      campaignId: snapshot.campaign.id,
      dir,
      baseFile,
      htmlPath: htmlArtifact.path,
      html,
      title,
    })
  }

  let docxArtifact: { id: string } | null = null
  if (format === 'DOCX' || format === 'ALL') {
    docxArtifact = await persistDocxArtifact({
      campaignId: snapshot.campaign.id,
      dir,
      baseFile,
      buffer: await exportDocxFromSummary(model),
    })
  }

  const riderArtifact = await persistJsonArtifact({
    campaignId: snapshot.campaign.id,
    dir,
    baseFile,
    data: model.references.rider,
  })
  const copyArtifact = await persistTextArtifact({
    campaignId: snapshot.campaign.id,
    dir,
    baseFile,
    filename: `${baseFile}-copy.txt`,
    content: buildCopyBundle(model),
  })

  await prisma.campaign.update({
    where: { id: snapshot.campaign.id },
    data: { status: 'COMPLETE' },
  })

  await writeCampaignMemory({
    campaignId: snapshot.campaign.id,
    market: snapshot.context.market,
    category: snapshot.context.category,
    promoType: snapshot.context.briefSpec?.typeOfPromotion || null,
    brief: snapshot.brief,
    rules: model.meta,
    offerIQ: snapshot.offerIQ?.verdict ?? null,
    strategist: snapshot.narratives?.strategist?.sanitized ?? snapshot.narratives?.strategist?.raw ?? null,
    evaluation: snapshot.evaluationMeta?.scoreboard ?? null,
    synthesis: snapshot.narratives?.synthesis?.sanitized ?? snapshot.narratives?.synthesis?.raw ?? null,
    outcomes: { exportId: (pdfArtifact || docxArtifact || htmlArtifact).id, judge: judgeVerdict },
  })

  console.log('✅ export generated', {
    html: htmlArtifact.path,
    pdf: pdfArtifact?.path,
    docx: docxArtifact?.path,
    rider: riderArtifact.path,
    copy: copyArtifact.path,
  })
}

type HtmlArtifactInput = {
  campaignId: string
  dir: string
  baseFile: string
  html: string
}

async function persistHtmlArtifact(input: HtmlArtifactInput) {
  const { campaignId, dir, baseFile, html } = input
  const htmlPath = join(dir, `${baseFile}.html`)
  writeFileSync(htmlPath, html, 'utf8')
  const bytes = Buffer.byteLength(html, 'utf8')
  const artifact = await prisma.exportArtifact.create({
    data: { campaignId, kind: 'HTML', path: htmlPath, bytes },
    select: { id: true, path: true },
  })
  return artifact
}

type PdfArtifactInput = {
  campaignId: string
  dir: string
  baseFile: string
  htmlPath: string
  html: string
  title: string
}

async function persistPdfArtifact(input: PdfArtifactInput) {
  const { campaignId, dir, baseFile, htmlPath, html, title } = input
  const pdfPath = join(dir, `${baseFile}.pdf`)

  if (pagedCliPath) {
    try {
      await renderWithPagedCli(pagedCliPath, htmlPath, pdfPath)
      const pdfBuffer = readFileSync(pdfPath)
      const artifact = await prisma.exportArtifact.create({
        data: { campaignId, kind: 'PDF', path: pdfPath, bytes: pdfBuffer.byteLength },
        select: { id: true, path: true },
      })
      return artifact
    } catch (err) {
      console.warn('[exports] Paged.js render failed — falling back to Puppeteer', err)
    }
  }

  let browser: puppeteer.Browser | null = null
  try {
    const exec = process.env.PUPPETEER_EXECUTABLE_PATH || detectChromeExecutable()
    browser = await puppeteer.launch({
      headless: true,
      executablePath: exec || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45_000 })
    await page.emulateMediaType('screen')
    try {
      await page.evaluate(async () => {
        if (document.fonts && 'ready' in document.fonts) {
          try {
            await document.fonts.ready
          } catch {
            /* ignore */
          }
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      })
    } catch {
      /* ignore */
    }
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size:10px;color:#6b7280;width:100%;padding:4px 14mm;display:flex;justify-content:space-between;">
          <span>${escapeHtmlInline(title)}</span>
          <span class="pageNumber"></span>/<span class="totalPages"></span>
        </div>
      `,
      margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
    })
    writeFileSync(pdfPath, pdfBuffer)
    const artifact = await prisma.exportArtifact.create({
      data: { campaignId, kind: 'PDF', path: pdfPath, bytes: pdfBuffer.byteLength },
      select: { id: true, path: true },
    })
    return artifact
  } catch (err) {
    console.warn('[exports] PDF render failed; HTML only. Set PUPPETEER_EXECUTABLE_PATH or install Chrome.', err)
    return null
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}

type DocxArtifactInput = {
  campaignId: string
  dir: string
  baseFile: string
  buffer: Buffer
}

async function persistDocxArtifact(input: DocxArtifactInput) {
  const { campaignId, dir, baseFile, buffer } = input
  const docxPath = join(dir, `${baseFile}.docx`)
  writeFileSync(docxPath, buffer)
  const artifact = await prisma.exportArtifact.create({
    data: { campaignId, kind: 'DOCX', path: docxPath, bytes: buffer.byteLength },
    select: { id: true, path: true },
  })
  return artifact
}

type JsonArtifactInput = {
  campaignId: string
  dir: string
  baseFile: string
  data: any
}

async function persistJsonArtifact(input: JsonArtifactInput) {
  const { campaignId, dir, baseFile, data } = input
  const jsonPath = join(dir, `${baseFile}.json`)
  const payload = JSON.stringify(data, null, 2)
  writeFileSync(jsonPath, payload, 'utf8')
  const artifact = await prisma.exportArtifact.create({
    data: { campaignId, kind: 'JSON', path: jsonPath, bytes: Buffer.byteLength(payload, 'utf8') },
    select: { id: true, path: true },
  })
  return artifact
}

type TextArtifactInput = {
  campaignId: string
  dir: string
  baseFile: string
  filename?: string
  content: string
}

async function persistTextArtifact(input: TextArtifactInput) {
  const { campaignId, dir, baseFile, filename, content } = input
  const path = join(dir, filename || `${baseFile}.txt`)
  writeFileSync(path, content, 'utf8')
  const artifact = await prisma.exportArtifact.create({
    data: { campaignId, kind: 'COPY', path, bytes: Buffer.byteLength(content, 'utf8') },
    select: { id: true, path: true },
  })
  return artifact
}

function ensureExportDir(campaignId: string) {
  const dir = join(process.cwd(), 'storage', 'exports', campaignId)
  mkdirSync(dir, { recursive: true })
  return dir
}

function buildArtifactBase(title: string) {
  const base = slug(title || 'export') || 'export'
  return `${base}-${Date.now()}`
}

function detectChromeExecutable(): string | null {
  const mac = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  const win = [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  ]
  const lin = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  const candidates = process.platform === 'darwin' ? mac : process.platform === 'win32' ? win : lin
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

function escapeHtmlInline(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildCopyBundle(model: SummaryModel): string {
  const lines: string[] = []
  lines.push(`# Copy bundle for ${model.meta.campaignTitle}`)
  lines.push(`Generated: ${model.meta.timestamp}`)
  lines.push('')
  lines.push('## Suggested copy blocks')
  const copyBlocks = model.copyBlocks.length ? model.copyBlocks : ['Refer to synthesis section for hero copy.']
  copyBlocks.forEach((line, idx) => lines.push(`${idx + 1}. ${line}`))
  lines.push('')
  lines.push('## Sections included')
  model.sections.forEach((section) => lines.push(`- ${section.title}`))
  return lines.join('\n')
}

function renderWithPagedCli(cliPath: string, inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, inputPath, '--output', outputPath, '--page-size', 'A4', '--media', 'print', '--timeout', '60000'], {
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', TERM: 'dumb' },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        const error = new Error(`pagedjs-cli exited with code ${code}${stderr ? `: ${stderr}` : ''}`)
        reject(error)
      }
    })
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('❌ export generation failed:', err instanceof Error ? err.message : err)
    prisma.$disconnect().finally(() => process.exit(1))
  })
