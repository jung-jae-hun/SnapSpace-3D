## Summary

Describe the change in 3-5 lines.

## Why

Explain the problem this PR solves and why this approach was chosen.

## Scope

- [ ] API
- [ ] Web
- [ ] Worker
- [ ] Infra / Docker
- [ ] Docs

## Validation

List the commands you ran and the result.

```bash
pnpm run ci:lint
pnpm run ci:typecheck
pnpm run ci:test
pnpm run ci:build
pnpm dev:docker:verify
pnpm smoke:lifecycle
```

## Risk and Rollback

- Risk level: low / medium / high
- Rollback plan:

## Checklist

- [ ] I updated docs/comments affected by this change.
- [ ] I verified no secret/token is included.
- [ ] I confirmed workflow checks are green.
