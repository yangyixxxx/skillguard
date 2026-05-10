# skill-guard 项目文档

## 1. 项目概述

**skill-guard** 是一个 AI Skill 上传安全扫描服务（Gate 1），用于在 Skill 部署前进行自动化安全分析。项目采用多层纵深防御策略，能够检测恶意代码、供应链攻击和 Prompt 注入等安全威胁。

**核心定位：** 作为 Skill 发布流程的第一道安全闸门，对上传的 ZIP 包执行快速扫描（目标 < 2s），并返回结构化的安全报告。

### 当前范围

| 已实现 | 未实现 |
|--------|--------|
| `POST /v1/scan/upload` 接收 ZIP 包 | Layer 3 LLM 深度审查（`POST /v1/review` 占位 501） |
| Layer 0 结构分析 + Layer 1 规则引擎 + Layer 2 依赖提取 | 安全认证徽章签发（`POST /v1/certify` 占位 501） |
| `GET /v1/report/:id` 查询报告 | TOCTOU / DNS 隧道等高级语义检测 |
| 规则不可用或超时时 fail-closed | |
| 多平台适配器：Newmax / OpenClaw / MCP / GPTs | |
| SQLite 持久化（用户、API Key、扫描记录、用量、刷新令牌） | |
| Auth：邮箱密码注册/登录、JWT、API Key、bcrypt | |
| Dashboard UI（静态资源 + `/dashboard/api/*`） | |
| 多租户、审计日志、Kill Switch | |
| CLI（terminal / JSON / SARIF）、GitHub Action、Docker | |
| MCP Server 包装（`@aspect/skill-guard-mcp-server`） | |

---

## 2. 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript 5.9.3（strict 模式，ESM） |
| 运行时 | Node.js（ES2022 target） |
| API 框架 | Fastify 5.6.1 |
| Monorepo | pnpm workspace + Turborepo |
| 测试 | Vitest 3.2.4 |
| ZIP 处理 | yauzl 3.2.0 |
| YAML 解析 | yaml 2.8.1 |
| 文件上传 | @fastify/multipart 9.2.1 |
| ID 生成 | nanoid 5.1.6 |

---

## 3. 项目结构

```
skill-guard/
├── packages/
│   ├── core/                          # @aspect/skill-guard — 核心扫描引擎
│   │   └── src/
│   │       ├── adapter/               # PlatformAdapter 接口 & auto-detect
│   │       ├── analyzers/             # structure / dependency / env-extractor / permission / normalizer / frontmatter
│   │       ├── config/                # 默认配置常量
│   │       ├── engine/                # rule-loader + rule-engine + rule-types
│   │       ├── report/                # builder + types + sarif + metadata-card
│   │       ├── scanner.ts             # 主编排器
│   │       ├── sdk.ts                 # SkillGuard SDK 类
│   │       └── errors.ts              # 错误类型
│   ├── adapters/
│   │   ├── newmax/                     # @aspect/skill-guard-adapter-newmax
│   │   ├── openclaw/                  # @aspect/skill-guard-adapter-openclaw
│   │   ├── mcp/                       # @aspect/skill-guard-adapter-mcp
│   │   └── gpts/                      # @aspect/skill-guard-adapter-gpts
│   ├── api/                           # @aspect/skill-guard-api — Fastify 服务
│   │   └── src/
│   │       ├── routes/                # scan-upload / report / rules / review / certify
│   │       │                          # auth-routes / api-key-routes / dashboard-api
│   │       ├── middleware/            # error / auth / rate-limit
│   │       ├── storage/               # report-store（内存实现）
│   │       ├── tenant/                # 多租户管理 + billing
│   │       ├── audit/                 # 审计日志
│   │       ├── killswitch/            # Kill Switch 管理
│   │       ├── public/                # Dashboard 静态资源
│   │       └── index.ts               # createApp 入口
│   ├── db/                            # @aspect/skill-guard-db — SQLite + repositories
│   │   └── src/
│   │       ├── connection.ts          # better-sqlite3 连接 + schema
│   │       └── repositories/          # users / api-keys / scans / usage / refresh-tokens
│   ├── cli/                           # @aspect/skill-guard-cli — 命令行工具
│   ├── action/                        # @aspect/skill-guard-action — GitHub Action
│   ├── mcp-server/                    # @aspect/skill-guard-mcp-server — MCP server 包装
│   └── middleware/                    # @aspect/skill-guard-middleware — 通用中间件
├── rules/
│   ├── base/                          # 合并产物：hard-triggers.yaml + common.yaml
│   ├── definitions/                   # 分类定义（cmd-injection / network / privilege / persistence / secrets / sensitive-file / other / mention）
│   ├── whitelist/                     # 包白名单：pypi / npm / cargo
│   ├── encrypt.ts                     # 规则加密脚本
│   └── sign.ts                        # 规则签名脚本
├── fixtures/skills/                   # 测试样本：safe / hard-trigger / prompt-injection / supply-chain
├── data/                              # SQLite 数据目录（运行时生成）
├── Dockerfile / docker-compose.yml    # 容器化部署
├── turbo.json                         # Turborepo 配置
├── pnpm-workspace.yaml                # pnpm 工作区
├── tsconfig.base.json                 # 基础 TS 配置
└── package.json                       # 根工作区
```

### 包依赖关系

```
@aspect/skill-guard (core)
        ↑
        ├── @aspect/skill-guard-adapter-{newmax,openclaw,mcp,gpts}
        ├── @aspect/skill-guard-cli
        ├── @aspect/skill-guard-mcp-server
        ├── @aspect/skill-guard-middleware
        └── @aspect/skill-guard-api ──── @aspect/skill-guard-db
```

---

## 4. 架构设计

### 4.1 多层检测架构

```
┌─────────────────────────────────────────────────────┐
│                    ZIP Upload                        │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│           Archive Validation & Extraction             │
│   • 路径穿越检查  • 大小限制  • ZIP 安全解压          │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│              Adapter Detection & Parsing              │
│   • SKILL.md 清单识别  • UTF-8 校验  • 文件分类       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│          Layer 0 — 结构分析 (Structure)               │
│   • 文件数量/大小限制      • Symlink 检测             │
│   • 二进制文件检测          • YAML frontmatter 校验   │
│   • allowed-tools 白名单   • references/ 目录约束     │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│          Layer 1 — 规则引擎 (Rule Engine)             │
│   • 加载 hard-triggers.yaml + common.yaml            │
│   • 逐行正则匹配（扩展名/上下文感知）                  │
│   • 硬触发 → 立即阻断                                │
│   • 加权评分 → 指数衰减算法                           │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│          Layer 2 — 依赖提取 (Dependency)              │
│   • Python import/pip install                        │
│   • Node.js require/import                           │
│   • 环境变量引用 (process.env / os.environ)           │
│   • (Layer 3 LLM 审查暂不实现)                       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│              Report Generation & Storage              │
│   • 聚合所有 findings  • 计算 score & riskLevel      │
│   • 设置 blocked 标志  • 内存存储 + 返回 200         │
└─────────────────────────────────────────────────────┘
```

### 4.2 适配器模式

项目采用 `PlatformAdapter` 接口实现平台解耦，当前已实现 `NewmaxAdapter`：

```typescript
interface PlatformAdapter {
  id: string;
  parseBundle(input: AdapterBundleInput | Buffer): Promise<ParsedBundle>;
  extractMetadata(bundle: ParsedBundle): Promise<ExtensionMetadata>;
  extractDependencies(bundle: ParsedBundle): Promise<Dependency[]>;
  extractEnvRefs(bundle: ParsedBundle): Promise<EnvRef[]>;
}
```

新平台只需实现该接口即可接入扫描流水线。适配器通过 `detectAdapter()` 自动匹配——检测 `SKILL.md` 清单文件即选择 Newmax 适配器。

### 4.3 超时与 Fail-Closed 机制

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `GATE1_TIMEOUT_MS` | 5000ms | 整体扫描硬超时 |
| `RULE_SCAN_TIMEOUT_MS` | 2000ms | 规则加载超时 |

**Fail-Closed 策略：** 任何内部错误（规则加载失败、超时、意外异常）均抛出 `SkillGuardError`，映射为 HTTP 503，绝不返回误导性的安全报告。

---

## 5. 规则系统

### 5.1 硬触发规则 (`hard-triggers.yaml`)

立即阻断，不计入评分。全部为 `severity: Critical`，`weight: 100`，`context: exec`。

| 规则 ID | 检测模式 | 说明 |
|---------|----------|------|
| `RM_RF_ROOT` | `rm\s+-rf\s+/` | 根目录删除 |
| `CURL_PIPE_SH` | `curl.*\|\s*(bash\|sh)` | curl 管道到 shell |
| `WGET_PIPE_SH` | `wget.*\|\s*(bash\|sh)` | wget 管道到 shell |
| `READ_SHADOW` | `cat\s+/etc/shadow` | 读取 shadow 文件 |

### 5.2 加权评分规则 (`common.yaml`)

| 规则 ID | 权重 | 严重性 | 文件类型 | 上下文 | 说明 |
|---------|------|--------|----------|--------|------|
| `PY_EVAL` | 6 | Low | `.py` | exec | Python eval 调用 |
| `SUBPROCESS_SHELL` | 20 | Medium | `.py` | exec | subprocess shell=True |
| `NODE_CHILD_EXEC` | 6 | Low | `.js/.ts` | exec | child_process.exec |
| `API_KEY` | 60 | High | 全部 | any | 硬编码 API Key |
| `CURL_PIPE_SH_MENTION` | 0 | Low | `.md` | mention | 文档中提及 curl pipe |

### 5.3 评分算法

```
扣分 = weight × (1 - 0.5^count) / (1 - 0.5)    # 指数衰减，重复命中递减
最终分数 = max(0, 100 - 总扣分)
```

**风险等级映射：**

| 分数区间 | 风险等级 |
|----------|----------|
| >= 90 | Safe |
| >= 70 | Low |
| >= 50 | Medium |
| >= 30 | High |
| < 30 | Critical（默认阻断阈值） |

### 5.4 上下文感知

规则引擎区分代码执行上下文和文档提及上下文：
- `context: exec` — 仅匹配非 `.md` 文件（实际可执行代码）
- `context: mention` — 仅匹配 `.md` 文件（文档引用）
- `context: any` — 匹配所有文件

---

## 6. API 接口

### 6.1 上传扫描

```
POST /v1/scan/upload
Content-Type: multipart/form-data
```

**请求：** `file` 字段传入 ZIP 包（`.zip` 后缀）

**成功响应 (200)：**

```json
{
  "id": "abc123xyz456",
  "blocked": false,
  "score": 94,
  "riskLevel": "Safe",
  "reasons": [],
  "findings": [],
  "dependencies": [
    { "name": "requests", "source": "import", "file": "main.py" }
  ],
  "envRefs": [
    { "name": "API_KEY", "file": "config.py" }
  ],
  "permissions": {
    "allowedTools": ["Read", "Grep", "Glob"]
  },
  "createdAt": "2026-04-02T00:00:00.000Z"
}
```

### 6.2 查询报告

```
GET /v1/report/:id
```

返回对应 ID 的 `SecurityReport`，未找到返回 404。

### 6.3 HTTP 语义

| 状态码 | 含义 |
|--------|------|
| `200` | 扫描成功（`blocked` 可能为 `true`） |
| `400` | `INVALID_BUNDLE` — 格式错误、路径穿越、结构无效 |
| `503` | `RULES_UNAVAILABLE` — 规则加载失败 |
| `503` | `GATE1_TIMEOUT` — 超时 |

---

## 7. 安全报告数据模型

```typescript
interface SecurityReport {
  id: string;                // nanoid 12位
  blocked: boolean;          // 是否阻断
  score: number;             // 0-100 安全评分
  riskLevel: RiskLevel;      // Safe | Low | Medium | High | Critical
  reasons: string[];         // 阻断原因
  findings: Finding[];       // 具体发现
  dependencies: Dependency[];// 提取的依赖
  envRefs: EnvRef[];         // 环境变量引用
  permissions: {
    allowedTools: string[];  // 声明的工具权限
  };
  createdAt: string;         // ISO 时间戳
}

interface Finding {
  id: string;                // 规则 ID
  message: string;           // 短标签
  source: 'layer0' | 'layer1';
  file?: string;
  line?: number;
  hardTrigger?: boolean;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';

  // ── 以下字段从 v0.2 起可选输出（layer1 命中且规则有定义时填入） ──
  description?: string;      // 这类规则为什么危险（模板，rule 级共享）
  remediation?: string;      // 怎么修（模板，rule 级共享）
  references?: string[];     // CWE / OWASP / 官方文档链接
  snippet?: {                // 命中行 ± 2 行真实代码
    startLine: number;       // lines[0] 的真实行号（1-based）
    lines: string[];
    matchIndex: number;      // lines 中真正命中行的下标
  };
}
```

### 7.1 规则可附带的元数据（YAML）

`rules/base/*.yaml` 里每条规则除 pattern/severity/weight 等核心字段外，可选附带：

| 字段 | 类型 | 用途 |
|------|------|------|
| `description` | 多行字符串 | 解释这类规则**为什么**危险，会原样回写到 finding |
| `remediation` | 多行字符串 | **怎么改**的具体指引，会原样回写 |
| `references` | 字符串数组 | CWE / OWASP / 官方文档 URL |
| `excludeValuePattern` | 正则字符串 | 命中后值匹配此正则则跳过（避免占位符 / `${ENV}` 误报） |
| `minValueEntropy` | 数值 | 命中值的 Shannon 熵低于此值则跳过 |

未填的字段不会出现在响应里。规则引擎在生成 finding 时还会自动切出命中行 ± 2 行真实代码作为 `snippet`，无需规则配置。

---

## 8. 默认配置

```typescript
DEFAULT_GATE1_SCORE_THRESHOLD   = 30              // 阻断阈值（分数低于此值阻断）
DEFAULT_GATE1_TIMEOUT_MS        = 5000            // 整体超时 5s
DEFAULT_RULE_SCAN_TIMEOUT_MS    = 2000            // 规则加载超时 2s
DEFAULT_MAX_ARCHIVE_BYTES       = 10 * 1024 * 1024 // ZIP 大小上限 10MB
DEFAULT_MAX_TOTAL_FILES         = 200             // 文件数上限
DEFAULT_MAX_TOTAL_BYTES         = 10 * 1024 * 1024 // 解压总大小上限 10MB
DEFAULT_MAX_SINGLE_FILE_BYTES   = 1 * 1024 * 1024  // 单文件上限 1MB
DEFAULT_MAX_REFERENCES_FILES    = 100             // references/ 文件数上限
DEFAULT_MAX_REFERENCES_SINGLE_FILE_BYTES = 512 * 1024 // references/ 单文件上限 512KB

DEFAULT_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob']   // 未声明时的默认工具权限
ALLOWED_TOOLS_WHITELIST = ['Read', 'Grep', 'Glob', 'Bash', 'Write',
                           'Edit', 'MultiEdit', 'WebSearch', 'WebFetch']
```

---

## 9. 开发指南

### 9.1 环境准备

```bash
pnpm install
```

### 9.2 构建

```bash
pnpm -r build              # 全量构建（Turbo 编排）
```

### 9.3 测试

```bash
pnpm --filter @aspect/skill-guard test               # 核心引擎测试
pnpm --filter @aspect/skill-guard-adapter-newmax test  # 适配器测试
pnpm --filter @aspect/skill-guard-api test            # API 服务测试
```

### 9.4 本地运行

```bash
pnpm --filter @aspect/skill-guard-api build
node packages/api/dist/index.js                       # 启动在 :3000
```

### 9.5 快速验证

```bash
cd fixtures/skills/safe
zip -r /tmp/safe-skill.zip .
curl -X POST http://localhost:3000/v1/scan/upload -F "file=@/tmp/safe-skill.zip"
```

---

## 10. 设计决策

| 决策 | 理由 |
|------|------|
| 多层纵深防御 | 每层捕获不同攻击向量，互相补充 |
| 硬触发立即阻断 | `rm -rf /` 等模式无需评分，必须阻断 |
| 指数衰减评分 | 重复命中递减权重，避免同一规则过度惩罚 |
| Adapter 模式 | 为不同平台（Newmax、Claude Skills 等）提供扩展点 |
| 内存存储（MVP） | Gate 1 追求低延迟，后续可替换为持久化 |
| Fail-Closed | 任何异常返回 503，绝不给出虚假安全的报告 |
| 上下文感知 | 同一模式在代码中为威胁、在文档中为低风险 |
| 超时预算 | 目标 < 2s，硬上限 5s，防止上传阻塞 |

---

## 11. 安全防护覆盖

### 已覆盖的攻击向量

- **恶意代码执行** — Layer 1 硬触发规则检测危险命令
- **供应链攻击** — Layer 2 提取并记录所有外部依赖
- **Prompt 注入** — Layer 0 frontmatter 校验 + Layer 1 模式匹配
- **符号链接攻击** — Layer 0 检测并拒绝 symlink
- **二进制隐藏** — Layer 0 检测二进制文件
- **YAML 注入** — 禁止 YAML type tag
- **路径穿越** — archive-ingest 服务在解压时检查路径

### 待实现

- TOCTOU 攻击防护
- DNS 隧道检测
- 语义级分析（需 Layer 3 LLM 支持）

---

## 12. 持久化与认证（@aspect/skill-guard-db + api/middleware）

API 层启用 SQLite 后会自动建表并启用 auth/计费/审计闭环，未提供 `dbPath` 时退化为纯内存模式。

### 12.1 数据库

| Repository | 表 | 主要字段 |
|------------|----|----------|
| `UserRepository` | `users` | `id`, `email`, `password_hash`, `tier`, `created_at` |
| `ApiKeyRepository` | `api_keys` | `id`, `user_id`, `prefix`, `hashed_key`, `last_used_at` |
| `ScanRepository` | `scans` | `id`, `user_id`, `report_id`, `score`, `blocked`, `created_at` |
| `UsageRepository` | `usage` | `user_id`, `period`, `scan_count` |
| `RefreshTokenRepository` | `refresh_tokens` | `id`, `user_id`, `token_hash`, `expires_at` |

启用方式：

```ts
const app = await createApp({
  dbPath: './data/skill-guard.db',  // 或 ':memory:'
  jwtSecret: process.env.JWT_SECRET,
});
```

### 12.2 路由总览

| 路径 | 说明 |
|------|------|
| `POST /v1/scan/upload` | ZIP 扫描（无需认证；登录后写入 scans/usage） |
| `GET  /v1/report/:id` | 查询单条报告 |
| `GET  /v1/rules/version` | 当前规则版本与计数 |
| `GET  /v1/rules/download` | 下载规则文件 |
| `POST /v1/review` | LLM 深度审查（**501 占位**，Phase 2） |
| `POST /v1/certify` | 安全认证徽章签发（**501 占位**） |
| `GET  /v1/badge/:id` | 获取 SVG 徽章 |
| `POST /v1/auth/register` | 邮箱密码注册（bcrypt） |
| `POST /v1/auth/login` | 登录，返回 access + refresh JWT |
| `POST /v1/auth/refresh` | 刷新 access token |
| `POST /v1/auth/logout` | 撤销 refresh token |
| `*    /v1/api-keys/*` | API Key 增删查（前缀 + hash 存储） |
| `*    /dashboard/api/*` | Dashboard 后端 API |
| `GET  /` | Dashboard 静态页 |

### 12.3 中间件

- `middleware/auth.ts` — Bearer JWT 与 API Key 双通道，挂载 `request.user`
- `middleware/rate-limit.ts` — 按用户 / IP 限流
- `middleware/error.ts` — `SkillGuardError` → HTTP 状态码映射

### 12.4 多租户、审计、Kill Switch

| 模块 | 路径 | 职责 |
|------|------|------|
| 租户管理 | `api/src/tenant/manager.ts` + `billing.ts` | 计划 tier、配额、计费上下文 |
| 审计日志 | `api/src/audit/logger.ts` | 关键操作（登录、Key 变更、阻断扫描）落盘 |
| Kill Switch | `api/src/killswitch/manager.ts` | 全局 / 单租户紧急停用扫描入口 |

三者均提供 `InMemory*` 默认实现，可通过 `createApp({ tenantManager, auditLogger, killSwitchManager })` 注入自定义实现。

---

## 13. CLI / Action / MCP Server

### 13.1 CLI（@aspect/skill-guard-cli）

```
skill-guard scan [--mode quick|standard|deep] [--format terminal|json|sarif]
                 [--rules-dir ./rules/base] [--threshold 30] <path>
skill-guard report <path>          # 输出 metadata-card JSON
```

退出码：检测分数 < `--threshold` 或命中硬触发时退出 1。

### 13.2 GitHub Action（@aspect/skill-guard-action）

发布产物 `aspect-ai/skill-guard-action@v1`，输入：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `path` | `./` | 扫描目录 |
| `fail-on-score-below` | `30` | 阻断阈值 |
| `format` | `sarif` | 输出格式（推荐配合 `github/codeql-action/upload-sarif` 上传到 Security tab） |

### 13.3 MCP Server（@aspect/skill-guard-mcp-server）

将扫描能力包装为 MCP tool，便于在 Claude Desktop / IDE 中作为安全检测工具调用。入口为 `packages/mcp-server/src/index.ts`，stdio 协议。
