// apps/backend/src/lib/polish.ts
export function polishText(s = '', { brand = '', locale = 'en-AU' } = {}) {
  let out = (s || '').normalize('NFC')
  const standardFixes: Array<[RegExp, string]> = [
    [/Grant\s+B(rueg|urg[e]?)/gi, 'Grant Burge'],     // brand guard
    [/Mother\s*s['’`"]?\s*Day/gi, "Mother’s Day"],    // typography
    [/\bcenter\b/gi, 'centre'],
    [/\bcenters\b/gi, 'centres'],
    [/\bcentered\b/gi, 'centred'],
    [/\bcentering\b/gi, 'centring'],
    [/\bfulfillment\b/gi, 'fulfilment'],
    [/\banalyze\b/gi, 'analyse'],
    [/\bbehavior\b/gi, 'behaviour'],
    [/\bGnness\b/gi, 'Guinness'],
    [/\bSir\s+Guinness\b/gi, 'Sir Guinness'],
    [/\bWicked\s+Ssisters\b/gi, 'Wicked Sisters'],
    [/\breqres\b/gi, 'requires'],
  ]
  for (const [re, rep] of standardFixes) out = out.replace(re, rep)

  const clicheFixes: Array<[RegExp, string]> = [
    [/\bzeitgeist\b/gi, 'moment'],
    [/\bcultural\s+crescendo\b/gi, 'cultural moment'],
    [/\bgame[-\s]?changer\b/gi, 'step-change'],
    [/\bseismic\s+shift\b/gi, 'major shift'],
    [/\bparadigm\s+shift\b/gi, 'major change'],
    [/\bno[-\s]?brainer\b/gi, 'clear win'],
  ]
  for (const [re, rep] of clicheFixes) out = out.replace(re, rep)

  const phraseScrubs: Array<[RegExp, string | ((...args: any[]) => string)]> = [
    [/\b([Tt]his)\s+moment is ripe\b/g, (_m, lead: string) => `${lead} is the right moment`],
    [/\bthe moment is ripe\b/gi, 'now is the right moment'],
    [/\bmoment is ripe\b/gi, 'the moment is right now'],
    [/\b([Tt]his)\s+now is the right moment\b/g, (_m, lead: string) => `${lead} is the right moment`],
    [/\bat the end of the day\b/gi, 'ultimately'],
    [/\bin today’s landscape\b/gi, 'right now'],
    [/\bthe emerald city\b/gi, 'the Wicked universe'],
  ]
  for (const [re, rep] of phraseScrubs) out = out.replace(re, rep as any)

  // Collapse whitespace early so later quote fixes behave
  out = out.replace(/(\s)+/g, ' ')

  // Straight → curly quotes (lightweight)
  out = out.replace(/(\w)'(\w)/g, '$1’$2').replace(/"([^"]+)"/g, '“$1”')
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1')
  return out.trim()
}
