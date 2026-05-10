# skill-guard

[![npm version](https://img.shields.io/npm/v/@yangyixxxx/skill-guard?color=0e9be9&label=npm)](https://www.npmjs.com/package/@yangyixxxx/skill-guard)
[![license](https://img.shields.io/badge/license-Apache--2.0-2c7a3a)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-2c7a3a)](https://nodejs.org/)
[![rules](https://img.shields.io/badge/rules-72-2c7a3a)](https://github.com/yangyixxxx/skillguard/tree/main/rules/base)
[![bundle](https://img.shields.io/badge/bundle-300KB-2c7a3a)](https://github.com/yangyixxxx/skillguard/blob/main/dist/skill-guard.mjs)
[![SaaS](https://img.shields.io/badge/SaaS-skillguard.vip-0e9be9)](https://skillguard.vip)

[English](./README.md) · [中文](./README.zh-CN.md)

> 本地优先的 AI Skill 安全扫描器。在 Skill 真正落到用户机器之前就把**恶意代码、供应链投毒、Prompt 注入**拦下来。**纯静态分析 — 2 秒以内、零 LLM 成本。**

72 条内置规则 · 4 个平台适配器（Newmax / OpenClaw / MCP / GPTs Actions） · terminal / JSON / [SARIF](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) 输出 · fail-closed 设计。

> ⚠️ **关于本项目** — 这是一个由 AI 全程"vibe coding"产出的项目，规则准确度尽力而为，**存在误报和漏检的可能**。遇到不准的 case 请到 [Issues](https://github.com/yangyixxxx/skillguard/issues) 贴上目标 Skill（或最小复现），**AI Agent 会自动参考每一条 issue 并把它喂回规则集做学习与优化** —— 每一个 bad case 都会让这把扫描器更准。

这个仓库是**开源的本地 CLI**。托管 SaaS [skillguard.vip](https://skillguard.vip) 在它之上又加了 Layer 3 LLM 复核、规则滚动更新、公开的 [Safe Rank](https://skillguard.vip/skills) 排行榜。

## 安装

```bash
# 一次性、不装 (直接从仓库拉)
npx -y github:yangyixxxx/skillguard scan ./my-skill

# 全局安装 (npm 包名: @yangyixxxx/skill-guard)
npm i -g @yangyixxxx/skill-guard
skill-guard scan ./my-skill
```

要求 Node.js ≥ 20。

> npm 包名是 **`@yangyixxxx/skill-guard`**（带连字符），GitHub 仓库叫 `yangyixxxx/skillguard`（不带连字符）—— 历史原因，指的是同一个项目。

## 用法

```bash
# 扫一个目录
skill-guard scan ./my-skill

# JSON 输出
skill-guard scan --format json ./my-skill > report.json

# SARIF (粘进 GitHub Code Scanning)
skill-guard scan --format sarif ./my-skill > results.sarif

# 收紧失败阈值 (默认 70)
skill-guard scan --threshold 50 ./my-skill

# 渲染元数据卡片
skill-guard report ./my-skill
```

退出码：score ≥ 阈值 且没硬阻断规则被触发 → `0`；否则 `1` —— 直接塞进任何能读 shell exit status 的流水线。

## 它到底查什么

**Layer 0 — 结构。** 文件数量/大小限制、路径穿越、符号链接、二进制 blob 检测、YAML frontmatter 校验、allowed-tools 白名单。

**Layer 1 — 规则。** 72 条 pattern 分两组：
- **22 条硬阻断**：单条命中即失败（`rm -rf /`、`curl … | sh`、硬编码 `sk-…` 形态密钥、eval 注入、读 SSH/AWS 凭证…）
- **50 条加权规则**：跨文件指数衰减打分；上下文敏感（代码 vs 文档区别对待）

**Layer 2 — 依赖。** 抽出每个 Python `import`、Node `require`、Cargo crate、env-var 引用，跟 PyPI / npm / Cargo 白名单对比，识别 typosquat。

如果规则加载不上或扫描超时，CLI **拒绝输出"通过"报告** —— 我们宁愿多 block 几秒，也不会假绿勾放过去。

## 公开审计报告

我们对大型 Skill 公共仓库做持续扫描，并公开 roll-up 结果：

- **ClawHub 注册库** — 57,581 个 skill 已审计 · [skillguard.vip/report/clawhub](https://skillguard.vip/report/clawhub) · 原始 [JSON](https://skillguard.vip/report/clawhub.json)
- **Safe Rank**（可排序、可搜索、可下钻到单个 skill）— [skillguard.vip/skills](https://skillguard.vip/skills)
- **Wall of Shame**（被自动阻断的，按最差排序）— [skillguard.vip/skills/blocked](https://skillguard.vip/skills/blocked)

## 从源码自托管

```bash
git clone https://github.com/yangyixxxx/skillguard.git
cd skillguard
pnpm install
pnpm run build         # 重新生成 dist/skill-guard.mjs
node ./dist/skill-guard.mjs scan ./my-skill
```

预编译的 `dist/skill-guard.mjs` (~300 KB) 是入仓的，所以 `npx github:…` 不用 build。

## SaaS 增量 (skillguard.vip)

| | 本地 CLI（这个仓库）| SaaS |
|---|---|---|
| Layer 0–2 静态扫 | ✅ 离线 | ✅ |
| terminal / JSON / SARIF | ✅ | ✅ |
| GitHub Action / MCP 集成 | ✅ | ✅ |
| **Layer 3 LLM 复核**（语义级，捕静态规则漏的 case）| ❌ | ✅ 内置（无需自带 key）|
| **规则滚动更新**（新攻击模式，每周）| 🟡 仓库快照 | ✅ |
| **Safe Rank** 公开排行榜 | ❌ | ✅ |
| 扫描历史 / 审计日志 | ❌ | ✅ |
| 自带 LLM (Anthropic / OpenAI / vLLM) | ❌ | ✅ Pro+ |
| SSO / SLA / 自托管 | ❌ | ✅ Enterprise |

SaaS 免费层：30 次扫描 + 3 次 LLM 复核 / 月，不要信用卡。直接在 <https://skillguard.vip> 试。

## 项目起源

项目最初的设计文档放在 [`docs/PROJECT.md`](./docs/PROJECT.md) —— 这是 v0 时期的规划、威胁建模和架构草图。**后续所有迭代都是在这个基线之上演化出来的，过程里集合了市面上各类查杀思路**：Semgrep / CodeQL 的模式库、OWASP top-10 范式、GitHub Advanced Security 的检出经验、各家公开的密钥格式正则、供应链 typosquat 名单，以及业界公开披露过的 Skill / Agent 失陷事件复盘。如果你想知道这把扫描器"从哪来的"，看这一份就够了。

## 协议

**Apache-2.0**。CLI / 适配器 / 核心引擎故意宽松授权，方便嵌进任何（无论付费）流水线。

## 贡献

bad case、新规则、新适配器想法都欢迎在本仓库的 [Issues](https://github.com/yangyixxxx/skillguard/issues) 或 PR 里提。每一条上报的误报 / 漏检都会回流到规则集。
