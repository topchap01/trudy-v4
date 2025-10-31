#!/usr/bin/env tsx
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { buildCampaignBundle } from '../src/lib/campaign-bundle.js'
import { chat } from '../src/lib/openai.js'
import { prisma } from '../src/db/prisma.js'

function bundleContext(bundle: Awaited<ReturnType<typeof buildCampaignBundle>>): string {
  const { snapshot, rules } = bundle

  const sections: string[] = []

  sections.push([
    `Campaign`,
    `- Title: ${snapshot.campaign.title}`,
    `- Client: ${snapshot.campaign.clientName ?? 'n/a'}`,
    `- Market: ${snapshot.campaign.market ?? 'n/a'} | Category: ${snapshot.campaign.category ?? 'n/a'}`,
    `- Mode: ${snapshot.campaign.mode} | Status: ${snapshot.campaign.status}`,
  ].join('\n'))

  sections.push(`Brief Snapshot:\n${snapshot.brief.snapshot}`)

  const framingContent = snapshot.narratives.framing?.content?.trim()
  if (framingContent) sections.push(`Framing:\n${framingContent}`)

  const evaluationContent = snapshot.narratives.evaluation?.content?.trim()
  if (evaluationContent) sections.push(`Evaluation:\n${evaluationContent}`)

  const strategistContent = snapshot.narratives.strategist?.content?.trim()
  if (strategistContent) sections.push(`Strategist:\n${strategistContent}`)

  const synthesisContent = snapshot.narratives.synthesis?.content?.trim()
  if (synthesisContent) sections.push(`Synthesis:\n${synthesisContent}`)

  if (snapshot.research) {
    sections.push(`Research Dossier:\n${JSON.stringify(snapshot.research, null, 2)}`)
  }

  if (rules?.founder?.notes?.length) {
    sections.push(`Founder Notes:\n- ${rules.founder.notes.join('\n- ')}`)
  }

  if (rules?.guardrails) {
    sections.push(`Guardrails:\n${JSON.stringify(rules.guardrails, null, 2)}`)
  }

  if (snapshot.offerIQ) {
    sections.push(`OfferIQ:\n${JSON.stringify(snapshot.offerIQ, null, 2)}`)
  }

  return sections.join('\n\n---\n\n')
}

async function appendNote(campaignId: string, note: string) {
  const brief = await prisma.brief.findUnique({
    where: { campaignId },
    select: { assets: true },
  })
  const assets = (brief?.assets as Record<string, any> | null) ?? {}
  const list = Array.isArray(assets.__manualNotes) ? assets.__manualNotes : []
  list.push({
    at: new Date().toISOString(),
    note: note.trim(),
  })
  assets.__manualNotes = list
  await prisma.brief.update({
    where: { campaignId },
    data: { assets },
  })
}

async function main() {
  const campaignId = process.argv[2]
  if (!campaignId) {
    console.error('Usage: pnpm --filter @trudy/backend exec tsx scripts/campaign-chat.ts <campaignId>')
    process.exit(1)
  }

  const bundle = await buildCampaignBundle(campaignId)
  const contextText = bundleContext(bundle)

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: 'You are the Campaign Analyst. Answer using only the provided campaign artefacts. Cite sections or data when possible.',
    },
    {
      role: 'user',
      content: `Campaign artefacts:\n${contextText}`,
    },
  ]

  console.log(`Campaign ${bundle.snapshot.campaign.title} loaded. Ask questions about the campaign.`)
  console.log('Commands: :save <note> to append a note to the brief, :exit to quit.')

  const rl = readline.createInterface({ input, output })

  while (true) {
    const line = await rl.question('> ')
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === ':exit') break
    if (trimmed.startsWith(':save ')) {
      const note = trimmed.slice(6).trim()
      if (!note) {
        console.log('Provide note text after :save')
        continue
      }
      await appendNote(campaignId, note)
      console.log('Note saved to brief assets (__manualNotes).')
      continue
    }

    messages.push({ role: 'user', content: trimmed })
    try {
      const response = await chat({
        model: process.env.MODEL_DEFAULT || 'gpt-4o',
        system: messages[0].content,
        messages: messages.slice(1),
        temperature: 0.2,
        top_p: 0.9,
        max_output_tokens: 900,
        meta: { scope: 'campaign.debugger', campaignId },
      })
      console.log(response)
      messages.push({ role: 'assistant', content: response })
    } catch (err: any) {
      console.error('Chat error:', err?.message || err)
    }
  }

  rl.close()
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
