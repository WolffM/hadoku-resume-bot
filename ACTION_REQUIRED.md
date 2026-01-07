# Action Required: Regenerate pnpm Lockfile

## Problem
The CI build fails with:
```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation. 
The current "overrides" configuration doesn't match the value found in the lockfile
```

## What Was Fixed
1. ✅ Pinned pnpm version to 10.15.0 in both `package.json` (packageManager field) and GitHub Actions workflow
2. ✅ Updated DEVELOPMENT.md with pnpm version requirements

## What You Need To Do
The lockfile was generated with an older version of pnpm that had a bug. You need to regenerate it once with pnpm 10.15.0:

### Steps:
1. Install pnpm 10.15.0 globally:
   ```bash
   npm install -g pnpm@10.15.0
   ```

2. Verify the version:
   ```bash
   pnpm --version
   # Should output: 10.15.0
   ```

3. Regenerate the lockfile:
   ```bash
   pnpm install --no-frozen-lockfile
   ```

4. Commit and push the updated lockfile:
   ```bash
   git add pnpm-lock.yaml
   git commit -m "Regenerate lockfile with pnpm 10.15.0"
   git push
   ```

After this one-time fix, the CI build should work correctly.

## Technical Details
- **Root cause**: Known bug in pnpm 9.x and 10.5-10.6.x where frozen-lockfile incorrectly reports overrides mismatch
- **Fix**: pnpm 10.15.0 includes the fix (PR #9546)
- **Why this happened**: The lockfile was generated with pnpm 9.x which had the bug
- **Prevention**: The `packageManager` field now ensures everyone uses the same pnpm version

## References
- [pnpm issue #9283](https://github.com/pnpm/pnpm/issues/9283) - Original bug report
- [pnpm PR #9546](https://github.com/pnpm/pnpm/pull/9546) - Bug fix
