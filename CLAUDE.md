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

## Standard Workflow

```
Brief → planner → [human approval] → builder → qa → reviewer → [human approval] → ship
```

Conversion and growth agents run independently and feed back into the planner when findings are approved for implementation.

## When to Spawn Which Agent

Spawn **planner** when:
- A new feature or page needs to be built
- A bug has unclear scope
- A growth or conversion finding needs to become a spec

Spawn **builder** when:
- A planner spec exists and has been approved
- The spec includes clear acceptance criteria QA can test

Spawn **qa** when:
- Builder outputs a handoff note indicating work is complete

Spawn **reviewer** when:
- QA has written a report with result PASS or CONDITIONAL PASS

Spawn **conversion** when:
- Auditing the funnel, a specific page, or CTA performance
- Evaluating copy, trust signals, or signup flow

Spawn **growth** when:
- Exploring acquisition channels
- Planning SEO-driven content or structural changes
- Looking for zero-spend distribution opportunities

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
