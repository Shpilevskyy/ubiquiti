# Repo rules for Claude

- Check [PROGRESS.md](PROGRESS.md) first, before exploring code or asking about status, at the
  start of every new session in this repo. It tracks current state, what's done, what's next,
  and deployment/config decisions — keep it current as work progresses.
- Keep each task/change small — the user reviews nearly every line before committing. Prefer a
  diff a senior engineer could read and properly review in one sitting over one huge dump of
  code. If a requested task is naturally large, break it into smaller sequential steps (and say
  so) rather than delivering it as one sprawling change.
- Small PRs should not come at the cost of foreseeable rework. If a refactor/restructure is
  already known to be needed (e.g. it's specced, or the next task would obviously require it),
  do it now as its own small step rather than deferring it into a future feature PR — later PRs
  should build on clean structure, not pay for the refactor bundled with unrelated feature work.
- Never commit on your own. When a change is ready, stop and let the developer review the diff
  first; only run `git commit` after they explicitly say to proceed.
