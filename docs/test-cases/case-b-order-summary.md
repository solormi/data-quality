# 测试用例 B:订单金额汇总 — 单位 / 过滤类问题

## 用途

测试工具能否识别:

1. **单位混淆**(分 vs 元)
2. **状态枚举漏过滤**
3. **REFUND 负数污染总额**
4. **缺少 LIMIT**

## 字段 / 表信息

报表对应表:`dwd_orders_di`(订单明细日分区)

已知字段:

| 字段 | 类型 | 含义 | 已知问题 |
|------|------|------|---------|
| `order_id` | BIGINT | 订单 ID | 主键 |
| `user_id` | BIGINT | 用户 ID | **已知问题**:0.1% 为 NULL(游客下单),汇总时需 `WHERE user_id IS NOT NULL` |
| `amount` | DECIMAL(18,2) | 实付金额 | **已知问题**:单位是**分**,SQL 注释里必须明确,展示前需 `/ 100` 转元 |
| `status` | VARCHAR | 订单状态 | 枚举 `PAID` / `UNPAID` / `REFUND` / `CANCELED` |
| `created_at` | DATETIME | 下单时间 | 分区键,UTC |
| `discount_amt` | DECIMAL(18,2) | 优惠金额 | **已知问题**:`PAID` 订单中 0.3% 为 0(优惠未下发),不影响统计 |

报表口径要求:

- 仅统计 `status = 'PAID'`
- 排除 `user_id IS NULL`
- 时间窗口:当月 1 日至末日
- 输出 `user_id`、`order_cnt`、`total_amount`(元)
- **强制**:必须 `LIMIT 100`(top 用户)
- **强制**:`amount` 单位注释清晰

## 故意踩坑版 SQL

```sql
-- 订单金额汇总 — 测试版(故意踩坑)
-- 注意:这段 SQL 故意有几个问题
SELECT
  user_id,
  COUNT(*)           AS order_cnt,
  SUM(amount)        AS total_amount_yuan
FROM dwd_orders_di
WHERE created_at BETWEEN '2026-09-01' AND '2026-09-30'
GROUP BY user_id
```

## 这份 SQL 应该被识别出的违规

1. **未过滤 `status = 'PAID'`** —— 包含 UNPAID / REFUND / CANCELED
2. **未排除 `user_id IS NULL`** —— 游客订单会被算进
3. **缺少 `LIMIT 100`** —— 没有 top 约束
4. **单位混淆** —— `total_amount_yuan` 别名暗示"元",但 `amount` 实际是"分",需要除以 100 才是元

## 测试方法

在 Web UI 里:

- **左 SQL 框**:粘贴上面的 SQL
- **右 文档框**:粘贴本 md 的"字段 / 表信息"和"报表口径要求"两段
- 点 `审查`
