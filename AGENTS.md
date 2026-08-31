# Working agreements

## Git: never merge to `main`

`main` is the deploy branch. Railway builds from it, so a merge to `main` is a
production release.

- **Never merge `develop` into `main`.** Stephan does this, always.
- **Never merge a pull request.** Opening one is fine; merging is not.
- Do the work on `develop`, commit, push, and open the PR if asked. Then report
  the PR link and its CI status and stop there.

This holds even when a request implies deployment, and even when every check is
green. Ask rather than assume.

## Verifying before you claim something works

Run all three, and say so only if they pass:

```bash
npm run lint
npm test
npm run build
```

A change is not "live" because it is on `develop`. Check that the commit is an
ancestor of `origin/main` before calling anything deployed:

```bash
git merge-base --is-ancestor <sha> origin/main
```

## Writing

- No em dashes, in chat replies, code, comments, or product copy. Use a comma,
  a colon, or a second sentence.
- Do not create or edit docs that were not asked for.
