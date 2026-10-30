# Working with Claude Code on this repo

This is the workflow I follow when using Claude Code (or Codex) to change this codebase. The agent writes most of the code, and I own the requirements, the review and the result.

## 1. Start from the business problem

Write down the problem in plain language before touching code. For example: "Surveyors can't tell which jobs have waited longest for an inspection."

## 2. Isolate the work in a worktree

```bash
git switch main && git pull
git worktree add ../pdp-inspection-age -b feature/inspection-age
cd ../pdp-inspection-age && npm ci
claude
```

Each change gets its own branch and folder. Other developers' work, and my own unfinished changes, are never touched.

## 3. Give clear requirements and context

Example prompt:

> Read CLAUDE.md, `apps/api/src/routes/jobs.ts` and `apps/web/src/pages/Dashboard.tsx`.
> Add "days waiting" for jobs in the `new` status to the dashboard API and show the oldest five on the dashboard.
> Follow the contracts-first rule. Propose a plan before editing.

I review the plan and correct it before any code is written, for example by pointing out a shared component it should reuse.

## 4. Review what was generated

I don't merge code I can't explain. Things I check every time:

- **Security:** parameterised SQL, role checks in the API (not only the UI), no secrets in code or logs
- **Correctness:** edge cases such as empty lists, time zones, leap years, and pro-rating in the first financial year
- **Contracts:** request and response shapes changed in `@pdp/shared`, not redefined locally
- **Scope:** no unrelated rewrites or reformatting

When something is wrong, I find the root cause and tell the agent exactly what to fix, rather than asking it to "try again".

## 5. Verify

```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e
```

Then I check the change in the browser as the user would, signed in with each role it affects.

## 6. Pull request and deployment

```bash
git push -u origin feature/inspection-age
gh pr create --fill
```

The PR template records how the change was checked and which parts were AI-generated. CI runs the full suite and builds the Docker image. After merging, I clean up the worktree (`git worktree remove ../pdp-inspection-age`), then confirm the live deployment with `/api/health` and a quick test of the changed screen.
