/** Regenerates owner.json. Run only against code whose owner output is the reference. */
import { writeFileSync } from 'node:fs'
import { computeOwnerGolden } from './compute-owner.ts'

const golden = await computeOwnerGolden()
writeFileSync(new URL('./owner.json', import.meta.url), JSON.stringify(golden, null, 2) + '\n')
process.stdout.write(`wrote owner.json with ${Object.keys(golden).length} entries\n`)
