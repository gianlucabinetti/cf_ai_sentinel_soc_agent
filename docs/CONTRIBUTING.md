# Contributing to Sentinel

Thank you for your interest in Sentinel! This project was created as a Cloudflare AI internship assignment submission.

## Project Status

This is a **demonstration project** showcasing:
- Cloudflare Workers AI integration
- Production-grade TypeScript architecture
- Edge-native security automation

## For Reviewers

If you're reviewing this as part of the Cloudflare AI internship evaluation:

1. **Start with [ASSIGNMENT.md](./ASSIGNMENT.md)** - Requirements checklist and quick-start
2. **Review [README.md](./README.md)** - Overview and setup instructions
3. **Dive into [ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical deep dive
4. **Run tests:** `npm test` - No Cloudflare credentials needed

## Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start local development
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Code Style

- **TypeScript:** Strict mode, no `any` types
- **Formatting:** Standard Prettier defaults
- **Testing:** Vitest for unit tests
- **Comments:** Explain "why" not "what"

## Architecture Decisions

All major design decisions are documented in:
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical rationale
- [ASSIGNMENT.md](./ASSIGNMENT.md) - Design decisions section

## Testing Strategy

**What we test:**
- Type guards and validation
- Deterministic hashing
- Type safety

**What we don't test:**
- Workers AI inference (requires Cloudflare runtime)
- KV operations (requires namespace binding)
- Workflow execution (requires Workflows runtime)

See [tests/sentinel.test.ts](./tests/sentinel.test.ts) for details.

## Questions?

For questions about this submission, please contact [gbinetti2020@fau.du]

---

**Note:** This is an assignment submission, not an open-source project seeking contributions. However, feedback and suggestions are always welcome!
