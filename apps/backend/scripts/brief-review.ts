#!/usr/bin/env tsx
import process from 'node:process'
import { runBriefQAReview, persistBriefReview } from '../src/lib/brief-qa.js'

async function main() {
  const campaignId = process.argv[2]
  if (!campaignId) {
    console.error('Usage: pnpm --filter @trudy/backend exec tsx scripts/brief-review.ts <campaignId>')
    process.exit(1)
  }

  const review = await runBriefQAReview(campaignId)
  const filePath = persistBriefReview({ campaignId, review })
  if (filePath) {
    console.log('✅ Brief review saved to', filePath)
  }

  if (review.issues.length) {
    console.log('\nIssues:')
    for (const issue of review.issues) {
      console.log(`- [${issue.severity}] ${issue.field}: ${issue.details}${issue.fix ? ` — Fix: ${issue.fix}` : ''}`)
    }
  } else {
    console.log('No issues flagged.')
  }

  if (review.overall_status === 'BLOCKER') {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('brief-review failed', err)
  process.exit(1)
})
