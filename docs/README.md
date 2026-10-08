# data-quality 启动与使用文档

> Report SQL 审查工具 — 基于 LLM 的 SQL 质量反向校验

## 这是什么

`data-quality` 是一个 **Web + CLI 双模式工具**,用于在报表 SQL 写完后,**自动**对照需求文档 / ODS 数据特征画像,识别潜在违规(口径偏差、已知数据问题、未过滤的状态等)。

核心思路:**LLM 语义比对**——把 SQL 和参考文档一起喂给 LLM,让 LLM 输出违规列表。你新增一张表的"已知问题"文档,工具立即能识别,**无需改代码**。

## 前置条件

| 项目 | 要求 |
|------|------|
| Node.js | >= 20.19 |
| 包管理器 | pnpm(推荐)/ npm 均可 |
| LLM API Key | 任一 OpenAI 兼容服务(MiniMax / OpenAI / 本地 Ollama) |

## 一键启动

### 方式 1:Web UI(推荐,日常使用)

```bash
# 默认端口 3000
./docs/start.sh

# 自定义端口
./docs/start.sh 8080
```

启动后浏览器访问 `http://localhost:3000`,界面包含:
- 左 textarea:粘 SQL
- 右 textarea:粘需求文档 / 数据特征 md
- 按钮 `审查`:触发 LLM 比对
- 下方:渲染报告(违规列表 / ✅ 无违规)

**停止服务**:`Ctrl+C`

### 方式 2:CLI(脚本/CI 集成)

```bash
./docs/start.sh --cli <sql文件> <docs目录>
```

示例:
```bash
./docs/start.sh --cli samples/monthly-bill-summary.sql samples/docs
```

退出码:
- `0` = 未发现违规
- `1` = 有违规(LLM 识别到问题)
- `2` = 调用失败(网络 / API key / 超时)

## 首次配置

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env,填入 LLM API key
# 必填:OPENAI_API_KEY
# 可选:OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_TIMEOUT_MS / PORT
```

`.env` 已加入 `.gitignore`,**不会**被提交。

## 常见问题

### 端口被占用

```bash
./docs/start.sh 8080    # 用别的端口
# 或先释放
lsof -ti :3000 | xargs kill
```

### dist/ 缺失

脚本会自动检测,缺失时执行 `pnpm install && pnpm build`。也可手动:
```bash
pnpm install
pnpm build
```

### LLM 调用失败

退出码为 2,检查:
- `.env` 中 `OPENAI_API_KEY` 是否正确
- `OPENAI_BASE_URL` 是否可访问(国内用户常用 `https://api.minimaxi.com/v1`)
- `OPENAI_TIMEOUT_MS` 是否够大(默认 30000,即 30s)

### 换 LLM 提供方

修改 `.env`,任选其一:
```bash
# MiniMax 国际
OPENAI_BASE_URL=https://api.minimaxi.com/v1
OPENAI_MODEL=MiniMax-M3

# OpenAI
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 本地 Ollama(无需 key)
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3
```

## 用真实样本试跑

仓库自带一份故意带"已知问题"的 SQL 示例:

```bash
./docs/start.sh --cli samples/monthly-bill-summary.sql samples/docs
```

期望识别出:
1. 缺少 `WHERE status = 'PAID'`
2. 缺少 `LIMIT 100`
3. amount 单位(分 vs 元)未显式声明

`samples/docs/` 下另有 5 份 ODS 表的数据特征画像(会员主档 SCD / 等级拉链 / 等级变更日志等)。

## 自定义审查规则

**不需要改代码**——直接修改 prompt 模板或新增文档:

| 想做什么 | 改哪里 |
|---------|--------|
| 调整违规识别逻辑 | `prompts/review.md` |
| 增加新表的已知问题 | `samples/docs/<新表名>.md`(参考已有格式) |
| 加审查维度(如性能) | `prompts/review.md` 加段 |

每次 `.env` 改动后重启服务生效。`prompts/` 改动一般也需重启(dist 已编译进 JS)。

## 目录速查

```
data-quality/
├── docs/
│   ├── start.sh           ← 本文档配套启动脚本
│   └── README.md          ← 本文件
├── src/                   ← TS 源码(CLI + Web + parser + llm)
├── dist/                  ← 编译产物
├── web/                   ← Web 前端(单页 HTML)
├── prompts/review.md      ← LLM prompt 模板
├── samples/               ← 示范 SQL + ODS 数据特征 md
│   ├── monthly-bill-summary.sql
│   ├── docs/              ← 5 份 ODS 数据特征
│   └── README.md
├── .env                   ← 本地密钥(已 git-ignore)
├── .env.example           ← 配置模板
└── package.json
```
