/**
 * The owner's output must not move. golden/owner.json was produced by the code
 * before per-user blocks existed; this runs the same calls against the code now.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computeOwnerGolden } from './golden/compute-owner.ts'

const expected = JSON.parse(
  readFileSync(new URL('./golden/owner.json', import.meta.url), 'utf8')
) as Record<string, unknown>

describe('owner pipeline (golden)', () => {
  it('produces byte-identical keys, resumes, prompts, caches and variants', async () => {
    const actual = await computeOwnerGolden()
    assert.deepEqual(Object.keys(actual), Object.keys(expected))
    for (const key of Object.keys(expected)) {
      assert.deepEqual(actual[key], expected[key], `golden entry '${key}' changed`)
    }
  })
})
