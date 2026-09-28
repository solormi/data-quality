# 会员三表对比 · `ods_member_info_scd` / `ods_member_level_scd` / `ods_member_level_change_log`

> 维护人:数据组  
> 最近更新:2026-09-28  
> 用途:从 DWS 月度任务(`dws_member_level_agg_1m`)视角,梳理三张 ODS 表的差异与协同方式

## 1. 三表关系总览

| 维度 | `ods_member_info_scd` | `ods_member_level_scd` | `ods_member_level_change_log` |
|---|---|---|---|
| **数据形态** | 主档 SCD | 等级 SCD | 变更日志(append) |
| **业务定位** | 会员基础信息 | 会员等级快照 | 等级变更事件流 |
| **是否过滤删除** | ✅ 必须过滤(`deleted=0` + `op_type<>'DELETE'`) | ❌ 不过滤 | ❌ 不过滤 |
| **去重键** | `(tenant_id, member_id)` | `(tenant_id, user_id, member_id)` | `(tenant_id, user_id, member_id)` |
| **排序键** | `update_time DESC` | `update_time DESC, id DESC` | `update_time DESC, after_level_id DESC` |
| **历史范围** | 当前有效会员 | 全周期(含已删除) | 全周期 |
| **等级补全** | 无 | 上线日之后的等级 | 上线日之前 + 拉链表缺失兜底 |

## 2. 过滤口径差异

### 2.1 删除过滤

| 表 | 是否过滤删除 | SQL 写法 |
|---|---|---|
| `ods_member_info_scd` | ✅ 必须过滤 | `WHERE deleted = 0 AND op_type NOT IN ('-D', 'DELETE')` |
| `ods_member_level_scd` | ❌ 不过滤 | 拉链表是"历史快照",逻辑删除也要保留 |
| `ods_member_level_change_log` | ❌ 不过滤 | append-only,本就没有删除概念 |

**核心差异**:主档过滤"软删除",拉链表和日志保留所有变更。`member_info_in_level` CTE 用 `INNER JOIN` 把主档和拉链表对齐——主档先过滤脏数据,再用拉链表补等级。

### 2.2 水位线

三张表统一用 `date(create_time) <= '${dt}'` 做水位过滤,**左闭右开**。

- 上期(7 月末):`create_time < '2026-08-01'`
- 本期(8 月末):`create_time < '2026-09-01'`

## 3. 去重与排序差异

| 表 | ROW_NUMBER PARTITION BY | ORDER BY |
|---|---|---|
| `member_info_rank_table` | `tenant_id, member_id` | `update_time DESC` |
| `member_level_rank_table` | `tenant_id, user_id, member_id` | `update_time DESC, id DESC` |
| `member_level_change_log_rank_table` | `tenant_id, user_id, member_id` | `update_time DESC, after_level_id DESC` |

**为什么 `member_info_scd` 只用两键去重,而其他两张用三键?**

- `member_info_scd`:业务上一个 `member_id` 在主档里只会挂在一个 `user_id` 下,两键去重已经够
- `member_level_scd` / 变更日志:同一 `member_id` 可能挂在多个 `user_id` 下(虽然少见),三键去重更安全

## 4. 等级补全逻辑

DWS 通过 `member_level_info` CTE 实现等级兜底:

```sql
CASE
    WHEN '${dt}' > '${level_scd_dt}' THEN b.level_id
    WHEN '${dt}' <= '${level_scd_dt}' THEN COALESCE(c.after_level_id, b.level_id)
END AS member_level_id
```

| 情况 | 取哪张表 |
|---|---|
| 计算日期 > 拉链表上线日 | 直接用 `ods_member_level_scd.level_id` |
| 计算日期 ≤ 拉链表上线日 | 优先用 `change_log.after_level_id`,没有再回退到 `ods_member_level_scd.level_id` |

**为什么需要这个分支?**

- 拉链表上线日**之前**:没有拉链表数据,只能从变更日志推
- 拉链表上线日**之后**:拉链表是稳定数据源,但日志里有最新变更,优先用日志
- **变更日志 vs 拉链表不一致时**:以日志为准(`COALESCE` 优先日志),因为日志代表"业务实际发生的变更"

## 5. JOIN 关联差异

| JOIN | 关联键 | 用途 |
|---|---|---|
| `member_info_scd INNER JOIN member_level_scd` | `(tenant_id, user_id, member_id)` | 脏数据过滤:剔除有主档无等级的会员 |
| `member_level_info LEFT JOIN member_level_scd` | `(tenant_id, user_id, member_id)` | 取等级 |
| `member_level_info LEFT JOIN member_level_change_log_table` | `(tenant_id, member_id)` | 取日志(只用两键,因为日志 `user_id` 可能为空) |

**为什么日志用两键 JOIN?** 见 `ods_member_level_change_log` 文档 §2.2 "已知异常":日志里 `user_id` 缺失比拉链表多,两键 JOIN 更宽容。

## 6. 跨表数据校验建议

### 6.1 一致性校验

```sql
-- 检查同一 (tenant_id, user_id, member_id) 在三张表里的 update_time 是否一致
SELECT
    i.tenant_id, i.user_id, i.member_id,
    i.update_time AS info_ut,
    l.update_time AS level_ut,
    g.update_time AS log_ut
FROM member_info_rank_table i
LEFT JOIN member_level_rank_table l
       USING (tenant_id, user_id, member_id)
LEFT JOIN member_level_change_log_rank_table g
       USING (tenant_id, user_id, member_id)
WHERE i.rank_index = 1 AND l.rank_index = 1
```

### 6.2 异常场景排查

| 异常 | 排查 SQL |
|---|---|
| 只有 info 没有 level 的会员(脏数据) | `INNER JOIN` 后会被剔除,可加 `LEFT JOIN` 看剔除量 |
| 同一个 member 多个 user_id | `COUNT(DISTINCT user_id) > 1 GROUP BY member_id` |
| `op_type = 'DELETE'` 但 `deleted = 0` | `WHERE op_type = 'DELETE' AND deleted = 0` |
| 等级表无对应 `level_id` | `LEFT JOIN ods_level` 后看 `level_id IS NULL` 的会员数 |

## 7. 引用记录

| 报表 / Change | 引用位置 | 引用日期 |
|---------------|----------|----------|
| dws_member_level_agg_1m | 三表联合,贯穿全链路 | 2026-09-28 |

---

**变更记录**:
- 2026-09-28:初版,从 `数据特征_三张ODS表.md` 拆分而来
