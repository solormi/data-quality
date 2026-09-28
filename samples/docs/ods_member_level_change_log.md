# `ods_member_level_change_log` 数据特征

> 维护人:数据组  
> 最近更新:2026-09-28  
> 关联字典:[data_dictionary.md](../../data_dictionary.md#ods_member_level_change_log)

## 1. 表基本信息

| 维度 | 取值 |
|------|------|
| 表名 | `ods_member_level_change_log` |
| 表类型 | ODS(贴源) |
| 数据形态 | 等级变更日志(append-only,事件流) |
| 用途 | 在拉链表上线日之前补齐历史等级;DWS 里与 `ods_member_level_scd` 二选一/兜底 |
| 分区键 | `create_time`(DATE) |
| 表模型 | append-only 日志 |

## 2. 字段特征

### 2.1 字段:`tenant_id`

- **类型**:BIGINT
- **业务语义**:租户编号
- **取值约定**:固定枚举值
- **NULL 语义**:业务上不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:无

### 2.2 字段:`user_id`

- **类型**:BIGINT
- **业务语义**:用户编号
- **取值约定**:租户内唯一
- **NULL 语义**:**允许 NULL**(与拉链表不同)
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:
  - **坑 1**:`user_id` 字段在日志里可能为空。DWS 里 `JOIN member_level_change_log_table ON (tenant_id, member_id)` 只用两键关联,不用三键,正是因为日志里 `user_id` 缺失情况比拉链表多

### 2.3 字段:`member_id`

- **类型**:BIGINT
- **业务语义**:会员编号
- **取值约定**:租户内唯一
- **NULL 语义**:业务上不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:无

### 2.4 字段:`after_level_id`

- **类型**:BIGINT
- **业务语义**:**变更后**的等级 ID(对应 `ods_level.id`)
- **取值约定**:必须存在于 `ods_level.id` 中
- **NULL 语义**:理论上不允许 NULL(每次变更必有目标等级)
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:
  - **坑 2**:同一会员同一时刻,日志里的等级可能跟拉链表对不上。`COALESCE` 优先用日志,是因为日志代表"业务实际发生的变更"

### 2.5 字段:`id`

- **类型**:BIGINT
- **业务语义**:日志行 ID(用于排序 tie-break)
- **取值约定**:单调递增
- **NULL 语义**:不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:
  - **坑 3**:`update_time` 相同时,需用 `after_level_id DESC` 兜底排序

### 2.6 字段:`create_time` / `update_time`

- **类型**:TIMESTAMP
- **业务语义**:数据写入时间 / 数据更新时间
- **取值约定**:标准时间戳
- **NULL 语义**:理论上不允许 NULL
- **单位 / 精度**:秒级
- **特殊值**:无
- **已知异常**:
  - **水位线**:`DWS` 用 `date(create_time) <= '${dt}'` 做水位过滤
  - **坑 4**:**注释与代码不一致**:DWS 注释写"按 `create_time` 取最新",但代码实际用 `update_time DESC, after_level_id DESC`。**以代码为准**

## 3. 跨字段约束(业务规则)

- **规则 A**:append-only,不更新。同一会员可能有多个变更事件,`ROW_NUMBER() OVER ... ORDER BY update_time DESC` 取最后一条
- **规则 B**:`tenant_id` + `user_id` + `member_id` 构成业务主键(三键去重)
- **规则 C**:`after_level_id` 必须存在于 `ods_level.id`
- **规则 D**:拉链表上线日之前的等级唯一数据源——上线日之前没有拉链表,只能从日志推

## 4. 已知数据问题 / 坑

- **坑 1**:`user_id` 字段缺失比拉链表多,DWS 用两键 JOIN 兜底
- **坑 2**:与拉链表可能不一致——同一时刻两表对不上,以日志为准(`COALESCE` 优先日志)
- **坑 3**:`update_time` 相同时用 `after_level_id DESC` 兜底
- **坑 4**:DWS 注释与代码不一致——注释说按 `create_time`,代码实际用 `update_time DESC, after_level_id DESC`。**以代码为准**
- **坑 5**:append-only 特性——同一会员多条变更记录,必须 ROW_NUMBER 去重

## 5. 引用记录

| 报表 / Change | 引用位置 | 引用日期 |
|---------------|----------|----------|
| dws_member_level_agg_1m | `member_level_change_log_table` CTE | 2026-09-28 |
