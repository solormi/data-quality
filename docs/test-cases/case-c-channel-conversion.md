# 测试用例 C:渠道拉新统计 — 性能 / 全表扫描类问题

## 用途

测试工具能否识别:

1. **全表扫描**(无分区剪枝)
2. **`SELECT *`**
3. **JOIN 没带分区键**
4. **大表无 LIMIT**

## 字段 / 表信息

表 A:`dwd_user_register_di`(用户注册明细,日分区)

| 字段 | 类型 | 已知问题 |
|------|------|---------|
| `user_id` | BIGINT | 主键,非空 |
| `register_date` | DATE | 分区键 |
| `channel` | VARCHAR | 注册渠道,枚举值见数据字典 |
| `register_source` | VARCHAR | 注册来源,枚举 `app` / `h5` / `pc` |

表 B:`dwd_user_first_action_di`(用户首次行为日分区)

| 字段 | 类型 | 已知问题 |
|------|------|---------|
| `user_id` | BIGINT | 主键 |
| `action_date` | DATE | 分区键 |
| `first_action_type` | VARCHAR | 首次行为类型 |

报表口径要求:

- 时间窗口:近 7 天(`register_date >= current_date - 7`)
- 输出每个 channel 的:`register_cnt`、`first_action_cnt`、`conversion_rate`
- **强制约束**:
  - 必须带 `register_date` 过滤(分区剪枝)
  - JOIN 必须带分区键对齐
  - 不允许 `SELECT *`
  - 输出按 `register_cnt DESC LIMIT 50`

## 故意踩坑版 SQL(三种性能坑)

```sql
-- 渠道拉新统计 — 测试版(故意踩坑)
SELECT
  r.channel,
  COUNT(*)                                    AS register_cnt,
  COUNT(DISTINCT a.user_id)                   AS first_action_cnt,
  COUNT(DISTINCT a.user_id) / COUNT(*)        AS conversion_rate
FROM dwd_user_register_di r
JOIN dwd_user_first_action_di a
  ON r.user_id = a.user_id
GROUP BY r.channel
```

## 这份 SQL 应该被识别出的违规

1. **无分区剪枝** —— 两张表都缺日期过滤,会触发全表扫描(这两张都是大表)
2. **JOIN 没带分区键对齐** —— JOIN 条件只有 user_id,没有 action_date 与 register_date 的范围对齐,会导致数据倾斜 / 笛卡尔积风险
3. **缺少 `LIMIT 50`** —— 输出可能几十行(几十个 channel),违反报表口径
4. **`COUNT(*) / COUNT(*)` 整数除法** —— `conversion_rate` 永远是 0,SQL 应改成 `COUNT(DISTINCT a.user_id) * 1.0 / COUNT(*)`

## 测试方法

在 Web UI 里:

- **左 SQL 框**:粘贴上面的 SQL
- **右 文档框**:粘贴本 md 的"字段 / 表信息"和"报表口径要求"两段
- 点 `审查`

预期:报告里能看到至少 2 条性能类违规(全表扫描、JOIN 没带分区键)。
