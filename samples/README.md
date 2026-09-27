# Samples — 示范样本

## monthly-bill-summary

`monthly-bill-summary.sql` 是一个故意带几个"已知问题"的报表 SQL 示例,用于演示审查工具的能力。

对照 `docs/bill-spec.md`,这份 SQL 至少有以下违规(LLM 应能识别):
1. **已知问题**: 缺少 `WHERE status = 'PAID'`,未排除 `UNPAID` 和 `REFUND` 订单
2. **已知问题**: 缺少 `LIMIT 100`
3. **口径**: 没有显式区分 amount 单位(分 vs 元)

## 跑示范样本

需要先配 API key(任选其一):

```bash
# 方式 1:环境变量
export OPENAI_API_KEY=你的真实 key

# 方式 2:CLI 参数
node dist/index.js --sql samples/monthly-bill-summary.sql \
                   --docs samples/docs \
                   --api-key "$OPENAI_API_KEY"
```

## Web UI 启动

```bash
# 1. 确保 .env 已配(参考根目录 .env.example)
# 2. 编译
pnpm build

# 3. 启动 web 服务器
pnpm web
# 或:node dist/web.js

# 4. 浏览器访问 http://localhost:3000
```

Web UI 提供表单(SQL + 需求文档),点 `审查` 按钮即触发审查,结果直接显示在页面下方。

**端口自定义**:`PORT=8080 pnpm web`

预期输出:
- exit 0: 无违规(LLM 未识别)
- exit 1: 有违规(LLM 识别到上面的问题)
- exit 2: 调用失败(网络/key 问题)