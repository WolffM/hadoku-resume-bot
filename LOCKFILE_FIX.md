# Lockfile Configuration Mismatch Fix

## Problem
The CI build is failing with:
```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation. 
The current "overrides" configuration doesn't match the value found in the lockfile
```

## Root Cause
This is a known bug in pnpm versions 9.x, 10.5+, and 10.6.x where the `--frozen-lockfile` flag incorrectly reports a configuration mismatch for the `overrides` field, even when the configuration is identical between `package.json` and `pnpm-lock.yaml`.

## Solution
The lockfile needs to be regenerated with pnpm 10.15.0 or later, which includes the fix for this issue (PR #9546).

### Steps to Fix:
1. Ensure you have pnpm 10.15.0 or later installed:
   ```bash
   npm install -g pnpm@10.15.0
   ```

2. Regenerate the lockfile:
   ```bash
   pnpm install --no-frozen-lockfile
   ```

3. Commit the updated `pnpm-lock.yaml`:
   ```bash
   git add pnpm-lock.yaml
   git commit -m "Regenerate lockfile with pnpm 10.15.0"
   git push
   ```

## Changes Made
- Updated `package.json` to specify `"packageManager": "pnpm@10.15.0"` for version consistency
- Updated `.github/workflows/publish.yml` to use pnpm 10.15.0
- This ensures all developers and CI use the same pnpm version

## References
- [pnpm issue #9283](https://github.com/pnpm/pnpm/issues/9283)
- [pnpm PR #9546](https://github.com/pnpm/pnpm/pull/9546) (fix for this bug)
