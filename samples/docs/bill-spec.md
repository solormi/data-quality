# 月度账单汇总报表 — 需求规范

## 报表口径定义

- **报表名**: 月度账单汇总(monthly-bill-summary)
- **时间范围**: `created_at` 落在当月第一天到最后一天之间,使用 UTC 时区
- **过滤条件**:
  - `status = 'PAID'`(只统计已支付订单)
  - `created_at` 必须落在本月区间
- **输出字段**:
  - `user_id`: 用户 ID
  - `amount`: 折扣后金额(单位:分)
  - `created_at`: 订单创建时间
- **排序**: 按 `amount` 降序
- **限制**: 必须 `LIMIT 100`,只展示 top 100

## 数据特征 (orders 表)

- **user_id**: 用户 ID,类型 BIGINT
- **amount**: 折扣后金额,单位是分(不是元)。这是**已知问题**,业务方常误以为是元,SQL 必须明确单位。
- **created_at**: 创建时间,UTC 时区存储
- **status**: 枚举值 `PAID` / `UNPAID` / `REFUND`
  - **已知问题**:`UNPAID` 订单必须被排除(否则会出现负向金额展示),SQL 必须显式 `WHERE status = 'PAID'`
  - **已知问题**:`REFUND` 订单的 `amount` 是负数,直接汇总会导致总额失真,业务上不应计入"月度账单"
- **分区**: `orders` 表按 `created_at` 月份分区,所有查询必须带分区键

## 性能约束

- 必须使用分区剪枝(`WHERE created_at` 限定范围)
- JOIN 必须带分区键
- 全表扫描(`SELECT *` 无 `WHERE`)在报表场景下禁止