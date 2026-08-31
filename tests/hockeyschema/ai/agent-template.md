---
title: Agent Name Template
description: Template for documenting an agent's purpose, inputs and outputs.
owner: team-ai
tags: [agent, template]
version: 1.0
---

# Agent Name

## Purpose

Short description of what the agent does.

## Capabilities

- Bullet list of capabilities (e.g., browse web, call REST APIs, read/write files).

## Inputs

- `prompt` — the natural-language prompt or instructions the agent expects.
- `options` — optional configuration object (list expected keys).

## Outputs

- Structured JSON response schema (example).

## Example

Provide a minimal example showing `run(prompt, options)` and example result.

## Permissions & Secrets

List any credentials or elevated permissions required, and recommended storage (e.g., GitHub Secrets, HashiCorp Vault).

## Dependencies

List runtime dependencies and environment setup steps.

## How to run locally

1. Node/ts-node example command
2. How to run tests

## Tests / Validation

Describe any integration or unit tests and how to run them.
