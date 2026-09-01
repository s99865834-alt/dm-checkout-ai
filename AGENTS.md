# Working agreements

## What we're actually doing

This is a live Shopify app with paying merchants on it. The goal is to make it
good enough to earn installs and revenue, not to close tickets.

That has a practical consequence: shipped code that no merchant can reach is
worth nothing, and reporting it as done is worse than nothing, because it
stops anyone looking at it again. Judge your own work by whether a merchant
can use it and whether it does what the pricing page says it does.

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

### Green checks are not evidence a feature exists

Those three commands verify that the code which exists behaves correctly. They
cannot tell you a feature is reachable, and they will pass happily while it
isn't.

This is not hypothetical. The Pro default-product setting had its database
columns, had code reading them, had passing tests, and had no UI that could
ever write a value, so the column stayed null and the feature could not fire.
Everything was green for a week. It was even inspected during a "is this good
to go?" check, where it was assessed for whether it would crash (it wouldn't)
rather than whether it worked (it couldn't).

So before calling any feature done:

- **Name the path a merchant takes to reach it.** Which page, which control.
  If you can't name it, it isn't done.
- **Check the write side, not just the read side.** A fallback that reads a
  setting nothing can set is dead code.
- **If it's sold, it ships.** When copy on the pricing page, listing, or
  marketing site claims a behaviour, that behaviour must work before the copy
  goes live. Say so plainly if it doesn't.
- **Say what you did not verify.** "Tests pass" and "I watched it work on a
  real store" are different claims. Don't let one stand in for the other.

## Don't drop tracked work

When the todo list gets replaced for a new task, pending items from the old one
vanish silently. That is how the default-product picker was lost: it was
correctly written down three times, reworded each time, and never carried
forward once the next task started.

- Carry unfinished items into the new list, or say out loud that they're being
  abandoned and why. Never let one disappear quietly.
- Don't mark a schema migration as the feature. "Added the column" and "the
  merchant can set it" are separate items, and only the second one counts.
- When work is left unfinished at the end of a session, list it in the reply.
  Stephan is the one who has to remember it otherwise.

## Writing

- No em dashes, in chat replies, code, comments, or product copy. Use a comma,
  a colon, or a second sentence.
- Be concise. This applies to replies, commit messages, and docs alike.

## Docs: fix them, don't multiply them

There are already 28 `.md` files here. The default failure mode is an agent
writing a new one instead of doing the work.

- **Do not create new `.md` files.** Correcting or trimming an existing doc is
  expected and welcome. Adding another is not.
- If something needs recording, put it in the closest existing doc.
- Prefer deleting a stale doc over leaving it to be believed later.
