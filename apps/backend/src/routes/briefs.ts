// apps/backend/src/routes/briefs.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'

const router = Router()

/** Lightweight classifier used only for UI hints */
function classify(parsed: any) {
  const p = parsed || {}
  const hasHook = !!(p.hook && String(p.hook).trim())
  const hasMechanic = !!(p.mechanicOneLiner && String(p.mechanicOneLiner).trim())
  const hasPrize =
    !!(p.heroPrize && String(p.heroPrize).trim()) ||
    (Array.isArray(p.runnerUps) && p.runnerUps.length > 0)

  const mode = hasHook && hasMechanic && hasPrize ? 'EVALUATE' : 'CREATE'
  const confidence = (Number(hasHook) + Number(hasMechanic) + Number(hasPrize)) / 3
  return { mode, confidence, signals: { hasHook, hasMechanic, hasPrize } }
}

// GET brief (creates an empty shell client-side if missing)
router.get('/campaigns/:id/brief', async (req, res, next) => {
  try {
    const brief = await prisma.brief.findUnique({ where: { campaignId: req.params.id } })
    res.json({ brief })
  } catch (e) {
    next(e)
  }
})

// PUT brief (upsert)
router.put('/campaigns/:id/brief', async (req, res, next) => {
  try {
    const { rawText = null, parsedJson = null, assets = null } = req.body || {}

    const brief = await prisma.brief.upsert({
      where: { campaignId: req.params.id },
      update: { rawText, parsedJson, assets },
      create: { campaignId: req.params.id, rawText, parsedJson, assets },
    })

    // Return a lightweight classification hint for the UI
    const classification = classify(parsedJson)

    // Optionally sync the campaign.mode for convenience
    await prisma.campaign.update({
      where: { id: req.params.id },
      data: { mode: classification.mode },
    })

    res.json({ brief, classification })
  } catch (e) {
    next(e)
  }
})

/** Brief assets (list/remove) — safe minimal stubs so UI won’t 500.
 * If you want uploads, we’ll wire multer + file storage later.
 */
router.get('/campaigns/:id/brief/assets', async (req, res, next) => {
  try {
    const brief = await prisma.brief.findUnique({ where: { campaignId: req.params.id } })
    const assets = (brief?.assets as any)?.files || []
    res.json({ assets })
  } catch (e) {
    next(e)
  }
})

router.delete('/campaigns/:id/brief/assets/:assetId', async (req, res, next) => {
  try {
    const brief = await prisma.brief.findUnique({ where: { campaignId: req.params.id } })
    const current = (brief?.assets as any) || { files: [] }
    const files = Array.isArray(current.files) ? current.files : []
    const nextFiles = files.filter((f: any) => String(f.id) !== String(req.params.assetId))
    await prisma.brief.update({
      where: { campaignId: req.params.id },
      data: { assets: { ...current, files: nextFiles } as any },
    })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

export default router
