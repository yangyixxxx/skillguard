# skill-guard

[![npm version](https://img.shields.io/npm/v/@yangyixxxx/skill-guard?color=0e9be9&label=npm)](https://www.npmjs.com/package/@yangyixxxx/skill-guard)
[![license](https://img.shields.io/badge/license-Apache--2.0-2c7a3a)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-2c7a3a)](https://nodejs.org/)
[![rules](https://img.shields.io/badge/rules-72-2c7a3a)](https://github.com/yangyixxxx/skillguard/tree/main/rules/base)
[![bundle](https://img.shields.io/badge/bundle-300KB-2c7a3a)](https://github.com/yangyixxxx/skillguard/blob/main/dist/skill-guard.mjs)
[![SaaS](https://img.shields.io/badge/SaaS-skillguard.vip-0e9be9)](https://skillguard.vip)

[English](./README.md) · [中文](./README.zh-CN.md)

> Local-first security scanner for AI Skill bundles. Catches **malicious code, supply-chain attacks, and prompt injection** before a Skill ever reaches a user. **Pure static analysis — sub-2-second, zero LLM cost.**

72 built-in rules · 4 platform adapters (Newmax / OpenClaw / MCP / GPTs Actions) · terminal / JSON / [SARIF](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) output · fail-closed by design.

> ⚠️ **About this project** — built end-to-end by an AI in "vibe-coding" mode. Rule accuracy is best-effort and **false positives / missed cases are inevitable**. If you hit one, please open an [issue](https://github.com/yangyixxxx/skillguard/issues) with the offending Skill (or a minimal repro). **The maintainer agent reads every report and feeds it back into the rule set** — every bad case makes the scanner sharper.

This repo is the **open-source local CLI**. The hosted SaaS at [skillguard.vip](https://skillguard.vip) adds Layer-3 LLM review, regular rule updates, and the public [Safe Rank](https://skillguard.vip/skills) leaderboard on top.

## Install

```bash
# One-off, no install (resolves directly from this repo)
npx -y github:yangyixxxx/skillguard scan ./my-skill

# Global install (npm package: skill-guard)
npm i -g @yangyixxxx/skill-guard
skill-guard scan ./my-skill
```

Requires Node.js ≥ 20.

> npm package name is **`@yangyixxxx/skill-guard`** (with a hyphen). The GitHub repo lives at `yangyixxxx/skillguard` (no hyphen) for historical reasons — both refer to the same project.

## Usage

```bash
# Scan a directory
skill-guard scan ./my-skill

# JSON output
skill-guard scan --format json ./my-skill > report.json

# SARIF (paste into GitHub Code Scanning)
skill-guard scan --format sarif ./my-skill > results.sarif

# Tighten the failure threshold (default 70)
skill-guard scan --threshold 50 ./my-skill

# Render a metadata card from a saved report id
skill-guard report ./my-skill
```

Exit code: `0` if score ≥ threshold and no hard-trigger fired; `1` otherwise — drop it into any pipeline that knows how to read shell exit status.

## What it actually checks

**Layer 0 — Structure.** File-count / size limits, path traversal, symlinks, binary blob detection, YAML frontmatter validation, allowed-tools whitelist.

**Layer 1 — Rules.** 72 patterns split into:
- **22 hard-blocks** that single-handedly fail the bundle (`rm -rf /`, `curl … | sh`, hard-coded `sk-…` API keys, eval injection, SSH/AWS credential reads, …)
- **50 weighted rules** scored on an exponential-decay curve across files; context-aware (code vs. docs).

**Layer 2 — Dependencies.** Extracts every Python `import`, Node `require`, Cargo crate, env-var reference, and cross-checks against PyPI / npm / Cargo whitelists for typosquats.

If rules can't load or a scan times out, the CLI **refuses to ship a passing report** — it would rather block one second longer than slip through with a fake green check.

## Public audit reports

We continuously scan large public Skill catalogs and publish the rolled-up results:

- **ClawHub registry** — 57,581 skills audited · [skillguard.vip/report/clawhub](https://skillguard.vip/report/clawhub) · raw [JSON](https://skillguard.vip/report/clawhub.json)
- **Safe Rank** (sortable, searchable, per-skill detail) — [skillguard.vip/skills](https://skillguard.vip/skills)
- **Wall of Shame** (auto-blocked, worst first) — [skillguard.vip/skills/blocked](https://skillguard.vip/skills/blocked)

## Self-hosting from source

```bash
git clone https://github.com/yangyixxxx/skillguard.git
cd skillguard
pnpm install
pnpm run build         # regenerates dist/skill-guard.mjs
node ./dist/skill-guard.mjs scan ./my-skill
```

The pre-built `dist/skill-guard.mjs` (~300 KB) is committed so `npx github:…` works without a build step.

## SaaS extras (skillguard.vip)

| | Local CLI (this repo) | SaaS |
|---|---|---|
| Layer 0–2 static scan | ✅ offline | ✅ |
| terminal / JSON / SARIF | ✅ | ✅ |
| GitHub Action / MCP integration | ✅ | ✅ |
| **Layer 3 LLM review** (semantic, catches what regex misses) | ❌ | ✅ built-in (no key required) |
| **Rolling rule updates** (new attack patterns, weekly) | 🟡 repo snapshot | ✅ |
| **Safe Rank** public skill leaderboard | ❌ | ✅ |
| Scan history / audit log | ❌ | ✅ |
| Bring your own LLM (Anthropic / OpenAI / vLLM) | ❌ | ✅ Pro+ |
| SSO / SLA / self-hosted | ❌ | ✅ Enterprise |

Free tier on the SaaS: 30 scans + 3 LLM reviews / month, no credit card. Try at <https://skillguard.vip>.

## Origins

The project's original design document lives at [`docs/PROJECT.md`](./docs/PROJECT.md) — the v0 plan, threat model, and architecture sketch we started from. Everything since then is an iterative evolution on that baseline, **incorporating detection ideas from across the industry**: Semgrep / CodeQL pattern catalogs, OWASP top-10 conventions, GitHub Advanced Security findings, well-known credential-format regexes, supply-chain typosquat lists, and lessons from publicly disclosed Skill / agent compromises. If you want to know "where this thing came from," that file is the answer.

## License

**Apache-2.0**. The CLI, adapters, and core engine are deliberately permissive so you can drop them into any pipeline, paid or not.

## Contributing

Bad cases, new rules, adapter ideas — all welcome via [Issues](https://github.com/yangyixxxx/skillguard/issues) and PRs on this repo. Every reported false positive / missed case feeds back into the rule set.
