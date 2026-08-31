---
title: AI Docs Index
description: Index of guidelines, style guides and templates for this project.
owner: team-ai
tags: [docs, ai, prompts]
---

# AI documentation

This folder contains the guidelines this project is expected to follow, plus
templates for documenting agents and prompts.

Contents:

- `project-context.md` — project-level context (goals, constraints). Fill
  this in for the current system under test.
- `repo-structure.md` — where features, steps, page objects, and config live.
- `playwright-bdd-style.md` — style guide for Playwright BDD feature files
  and step implementations.
- `testing-guidelines.md` — testing practices and secrets handling.
- `ai-instructions.md` — rules for AI-generated code in this project.
- `accessibility-testing.md` — accessibility testing approach.
- `video-to-test-readme.md` — workflow to turn a UI screen recording into a
  working feature/steps/page-object set.
- `agent-template.md` — template for documenting an agent, if this project
  adds one.

Quick start

1. Fill in `project-context.md` for this specific system under test.
2. Read `playwright-bdd-style.md` and `testing-guidelines.md` before writing
   tests.
3. Keep these docs up to date as conventions evolve — they're the source of
   truth other contributors (and AI agents) will follow.
