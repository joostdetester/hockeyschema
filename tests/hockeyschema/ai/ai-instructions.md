---
title: AI Instructions
description: High-level instructions for using AI agents and prompts in this project.
owner: team-ai
tags: [ai, instructions]
version: 1.0
---

# AI Instructions for Code Generation

When generating code for this project:

## Always
- Follow the existing folder structure (see `repo-structure.md`)
- Use Playwright + Cucumber style
- Generate TypeScript
- Use Page Object Model
- Keep step definitions thin
- Use async/await
- Write readable, maintainable code

## Never
- Introduce Cypress or other test frameworks
- Add hard waits or sleeps
- Put locators inside step definitions
- Hardcode credentials or secrets
- Mix test logic with page logic

## Quality
- Prefer reusable methods
- Use meaningful method names
- Add basic error handling
- Write code that is CI-friendly
