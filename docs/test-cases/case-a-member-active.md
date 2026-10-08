# 测试用例 A:会员活跃度日报 — 故意踩坑 SQL

## 用途

这是 `data-quality` Web 工具的 **故意带多种违规的测试 SQL**,用于验证工具能否识别:

1. 已知数据问题(单位、口径、NULL)
2. 缺少强制过滤条件
3. 性能 / 全表扫描风险
4. 字段误用

跑出来报告越长,说明识别能力越强。

## 字段 / 表信息

报表对应表:`dwd_member_active_di`(会员活跃度明细,日增量分区)

已知字段:

| 字段 | 类型 | 含义 | 已知问题 |
|------|------|------|---------|
| `member_id` | BIGINT | 会员 ID | **不允许 NULL**(主键属性) |
| `active_date` | DATE | 活跃日期 | 分区键,所有查询必须带 |
| `duration_sec` | INT | 活跃时长(秒) | **已知问题**:0.5% 记录是 0(心跳丢失),SUM 时必须 `WHERE duration_sec > 0` |
| `pv` | INT | 当日 PV | 无 |
| `is_new` | TINYINT | 是否新会员(0/1) | **已知问题**:存在脏数据 `2`(来源枚举变更),统计新会员数时必须 `WHERE is_new IN (0, 1)` |
| `channel` | VARCHAR | 渠道 | **已知问题**:历史数据中 `channel = 'unknown'` 占 3%,不能算入"渠道分布"的有效分母 |

报表口径要求:

- 时间窗口:`active_date = 当前日期 - 1`
- 输出字段:`channel`、`active_member_cnt`、`avg_duration_sec`
- **强制过滤**:
  - `is_new IN (0, 1)`(排除脏数据)
  - `duration_sec > 0`(排除心跳丢失)
  - `channel != 'unknown'`(排除未知渠道)
- **强制约束**:
  - 必须用 `member_id`(不要用 `user_id`,ODS 里没这字段)
  - 必须带分区键 `active_date`
  - 不允许 `SELECT *`

## 故意踩坑版 SQL(测试用,不要真跑)

```sql
-- 会员活跃度日报 — 测试版(故意踩坑)
SELECT
  channel,
  COUNT(DISTINCT user_id)        AS active_member_cnt,
  AVG(duration_sec)              AS avg_duration_sec
FROM dwd_member_active_di
WHERE active_date = '2026-10-01'
GROUP BY channel
ORDER BY active_member_cnt DESC
```

## 这份 SQL 应该被识别出的违规

1. **`user_id` 字段不存在** —— 表里只有 `member_id`,属于字段误用 / 关联错表
2. **缺少 `duration_sec > 0` 过滤** —— 会把心跳丢失(0)的脏数据算进平均
3. **缺少 `is_new IN (0, 1)` 过滤** —— 不影响本 SQL(没用到 is_new),但 LLM 可能不报警
4. **缺少 `channel != 'unknown'` 过滤** —— 渠道分布会污染
5. **时间窗口不对** —— 用的是固定 `'2026-10-01'`,应该用 `current_date - 1`(动态)

## 测试方法

在 Web UI(`http://localhost:3000`)里:

- **左 SQL 框**:粘贴上面那段 SQL
- **右 文档框**:粘贴本 md 的"字段 / 表信息"和"报表口径要求"两段
- 点 `审查`

预期输出:违规列表至少包含上面 5 条的前 4 条。
