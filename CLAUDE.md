# minicuration.com — Claude Code Orchestrator

This file governs how Claude Code operates in this repo. All subagents are defined in `.claude/agents/`. Skills from `alirezarezvani/claude-skills` and `addyosmani/web-quality-skills` are available to the relevant agents.

## Team Structure

| Agent | File | Responsibility |
|-------|------|----------------|
| planner | `.claude/agents/planner.md` | Turns briefs into specs; runs SEO research first |
| builder | `.claude/agents/builder.md` | Implements from approved specs |
| qa | `.claude/agents/qa.md` | Tests builds against acceptance criteria |
| reviewer | `.claude/agents/reviewer.md` | Code review after QA passes |
| conversion | `.claude/agents/conversion.md` | CRO audits and funnel analysis |
| growth | `.claude/agents/growth.md` | Zero/low-spend acquisition strategy |
| web-quality-performance | `.claude/agents/web-quality-performance.md` | Performance subagent used by qa |
| web-quality-accessibility | `.claude/agents/web-quality-accessibility.md` | Accessibility subagent used by qa |
| web-quality-core-web-vitals | `.claude/agents/web-quality-core-web-vitals.md` | CWV subagent used by qa |
| web-quality-audit | `.claude/agents/web-quality-audit.md` | Full Lighthouse audit subagent |

## Slash Commands (SEO Skills)

| Command | File | Use |
|---------|------|-----|
| `/seo-audit` | `.claude/commands/seo-audit.md` | Full technical + on-page SEO audit |
| `/seo-page` | `.claude/commands/seo-page.md` | Single-page SEO check |
| `/seo-plan` | `.claude/commands/seo-plan.md` | AI/GEO visibility + keyword strategy |
| `/seo-geo` | `.claude/commands/seo-geo.md` | Site architecture + crawl structure |
| `/seo-programmatic` | `.claude/commands/seo-programmatic.md` | Programmatic SEO at scale |
| `/seo-content` | `.claude/commands/seo-content.md` | Content strategy planning |

## Standard Workflow

```
Brief → planner → [human approval] → builder → qa → reviewer → [human approval] → ship
```

Conversion and growth agents run independently and feed back into the planner when findings are approved for implementation.

## Agent Invocation

**Agents are only spawned when explicitly requested by the human.** Do not auto-invoke any agent based on context or inferred intent. Wait for the human to say which agent to run.

When asked, the available agents are:
- **planner** — turns a brief into a testable spec
- **builder** — implements an approved spec
- **qa** — tests a completed build
- **reviewer** — code review after QA passes
- **conversion** — CRO and funnel audit
- **growth** — zero-spend acquisition strategy

## Parallelism

Conversion and growth can run in parallel with each other.
QA and reviewer are sequential — reviewer always waits for QA.
Builder should not start without an approved spec.

## Handoff Convention

Agents communicate via files written to `.claude/work/`:
- Planner writes specs to `.claude/work/specs/[task-name].md`
- Builder writes handoff notes to `.claude/work/handoffs/[task-name].md`
- QA writes reports to `.claude/work/qa-reports/[task-name].md`
- Reviewer writes reviews to `.claude/work/reviews/[task-name].md`
- Conversion writes audits to `.claude/work/audits/conversion-[date].md`
- Growth writes findings to `.claude/work/audits/growth-[date].md`

Human reviews happen at spec approval and final reviewer sign-off. Nothing ships without both.
