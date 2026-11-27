import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { HadokuAuthContext } from '@wolffm/worker-utils'
import { resolveScope, scopeKeys, OWNER_SCOPE } from '../src/scope.ts'

const OWNER_ID = 'owner-0000'
const JOBPLATFORM_ID = 'svc-jobplatform'
const env = { RESUME_OWNER_USER_ID: OWNER_ID, ON_BEHALF_CALLER_USER_IDS: ` x , ${JOBPLATFORM_ID} ` }

function auth(userType: HadokuAuthContext['userType'], userId: string | null): HadokuAuthContext {
  return { userType, credential: 'k', userId, userName: null }
}

describe('resolveScope', () => {
  it('gives a friend their own scope, keyed by their edge-verified id', () => {
    assert.deepEqual(resolveScope(auth('friend', 'user-a'), env), {
      scope: { kind: 'user', userId: 'user-a' }
    })
  })

  it("maps the owner's own id to the owner scope", () => {
    assert.deepEqual(resolveScope(auth('friend', OWNER_ID), env), { scope: OWNER_SCOPE })
  })

  it('treats an admin as the owner', () => {
    assert.deepEqual(resolveScope(auth('admin', 'anything'), env), { scope: OWNER_SCOPE })
  })

  it('refuses a caller with no identity instead of falling back to the owner', () => {
    const r = resolveScope(auth('friend', null), env)
    assert.ok('error' in r)
    assert.equal(r.status, 403)
    const none = resolveScope(undefined, env)
    assert.ok('error' in none)
  })

  it('refuses an on_behalf_of_user_id that is not a string', () => {
    for (const bad of [42, { id: 'user-b' }, ['user-b'], true]) {
      const r = resolveScope(auth('service', JOBPLATFORM_ID), env, bad)
      assert.ok('error' in r, JSON.stringify(bad))
      assert.equal(r.status, 400, JSON.stringify(bad))
    }
    assert.deepEqual(resolveScope(auth('friend', 'user-a'), env, null), {
      scope: { kind: 'user', userId: 'user-a' }
    })
  })

  it('honours on_behalf_of_user_id from an allowlisted service caller', () => {
    assert.deepEqual(resolveScope(auth('service', JOBPLATFORM_ID), env, 'user-b'), {
      scope: { kind: 'user', userId: 'user-b' }
    })
    assert.deepEqual(resolveScope(auth('service', JOBPLATFORM_ID), env, OWNER_ID), {
      scope: OWNER_SCOPE
    })
  })

  it('refuses on_behalf_of_user_id from a friend or an unlisted service', () => {
    for (const a of [auth('friend', 'user-a'), auth('service', 'svc-other'), auth('wife', 'w')]) {
      const r = resolveScope(a, env, 'user-b')
      assert.ok('error' in r, `${a.userType} must not act for another user`)
      assert.equal(r.status, 403)
    }
  })

  it('refuses on_behalf_of_user_id when no allowlist is configured', () => {
    const r = resolveScope(auth('service', JOBPLATFORM_ID), {}, 'user-b')
    assert.ok('error' in r)
  })

  it('ignores an empty on_behalf_of_user_id', () => {
    assert.deepEqual(resolveScope(auth('friend', 'user-a'), env, '  '), {
      scope: { kind: 'user', userId: 'user-a' }
    })
  })

  it('rejects a user id that could escape its key space', () => {
    for (const bad of ['a:b', 'a b', 'x'.repeat(129)]) {
      const r = resolveScope(auth('service', JOBPLATFORM_ID), env, bad)
      assert.ok('error' in r, bad)
      assert.equal(r.status, 400)
    }
  })

  it('without RESUME_OWNER_USER_ID only an admin is the owner', () => {
    assert.deepEqual(resolveScope(auth('friend', OWNER_ID), {}), {
      scope: { kind: 'user', userId: OWNER_ID }
    })
  })

  it('refuses on_behalf_of_user_id when RESUME_OWNER_USER_ID is not configured', () => {
    // Otherwise the owner, named by jobplatform, would silently get a fresh user scope.
    const noOwner = { ON_BEHALF_CALLER_USER_IDS: JOBPLATFORM_ID }
    for (const named of [OWNER_ID, 'user-a']) {
      const r = resolveScope(auth('service', JOBPLATFORM_ID), noOwner, named)
      assert.ok('status' in r && r.status === 503, named)
    }
    const blank = { ...noOwner, RESUME_OWNER_USER_ID: '  ' }
    const r = resolveScope(auth('service', JOBPLATFORM_ID), blank, OWNER_ID)
    assert.ok('status' in r && r.status === 503)
  })
})

describe('scopeKeys', () => {
  it("keeps the owner's keys exactly as they were", () => {
    const k = scopeKeys(OWNER_SCOPE)
    assert.equal(k.blockIndex, 'resume:blocks:index')
    assert.equal(k.block('header'), 'resume:blocks:header')
    assert.equal(k.variant('abc'), 'resume:variant:abc')
    assert.equal(k.contact, 'resume:profile:contact')
    assert.equal(k.cache('tailored'), 'resume:tailored')
  })

  it("puts the user id in every one of a user's keys", () => {
    const k = scopeKeys({ kind: 'user', userId: 'u1' })
    for (const key of [
      k.blockIndex,
      k.block('header'),
      k.feedback,
      k.contact,
      k.variant('abc'),
      k.variantListPrefix,
      k.cache('tailored'),
      k.cache('coverletter'),
      k.cache('extras'),
      k.cache('form-answers')
    ]) {
      assert.match(key, /(^|:)u1(:|$)/, key)
    }
  })
})
