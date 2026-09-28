# `ods_member_level_scd` 数据特征

> 维护人:数据组  
> 最近更新:2026-09-28  
> 关联字典:[data_dictionary.md](../../data_dictionary.md#ods_member_level_scd)

## 1. 表基本信息

| 维度 | 取值 |
|------|------|
| 表名 | `ods_member_level_scd` |
| 表类型 | ODS(贴源) |
| 数据形态 | 等级 SCD(慢变化维表) |
| 用途 | DWS 月度任务用它给会员打"当前等级"标签 |
| 分区键 | `create_time`(DATE) |
| 表模型 | SCD 拉链 |

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
- **NULL 语义**:业务上不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:无

### 2.3 字段:`member_id`

- **类型**:BIGINT
- **业务语义**:会员编号
- **取值约定**:租户内唯一
- **NULL 语义**:业务上不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:
  - 与 `ods_member_info_scd` 同一规则:同一 `user_id` 下可能有多个 `member_id`

### 2.4 字段:`level_id`

- **类型**:BIGINT
- **业务语义**:等级业务 ID(雪花 ID,大整数)。对应 `ods_level.id`,不是直接的等级位
- **取值约定**:必须存在于 `ods_level.id` 中
- **NULL 语义**:理论上不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:
  - **坑 1**:`level_id` 不能直接当等级位(1~5)——它是业务 ID 大整数,必须关联 `ods_level` 维表,按成长值(`growth_value_threshold`)排序后映射成 `tier_index`
  - **坑 2**:DWS 里用 `IFNULL(b.id, 0)` 兜底,意味着 `level_id = 0` 表示"未分类桶"

### 2.5 字段:`id`

- **类型**:BIGINT
- **业务语义**:拉链表自身的行 ID(用于排序时的 tie-break)
- **取值约定**:单调递增
- **NULL 语义**:不允许 NULL
- **单位 / 精度**:无
- **特殊值**:无
- **已知异常**:
  - **坑 3**:`update_time` 相同时需要靠 `id DESC` 兜底排序,保证可复现

### 2.6 字段:`create_time` / `update_time`

- **类型**:TIMESTAMP
- **业务语义**:数据写入时间 / 数据更新时间
- **取值约定**:标准时间戳
- **NULL 语义**:理论上不允许 NULL
- **单位 / 精度**:秒级
- **特殊值**:无
- **已知异常**:
  - **水位线**:`DWS` 用 `date(create_time) <= '${dt}'` 做水位过滤
  - **坑 4**:**不过滤 `deleted` 和 `op_type`**——拉链表即使逻辑删除了也要保留,因为它是"历史快照"。这是与 `ods_member_info_scd` 最大的差异

## 3. 跨字段约束(业务规则)

- **规则 A**:`tenant_id` + `user_id` + `member_id` 构成业务主键(三键去重)
- **规则 B**:`update_time` 相同时,`id` 越大越新(`ORDER BY update_time DESC, id DESC`)
- **规则 C**:`level_id` 必须存在于 `ods_level.id`,否则 JOIN 后落到"未分类桶"(level_id = 0)
- **规则 D**:拉链表上线日之前的等级不在这里——系统早期只用变更日志记录等级,没生成拉链。DWS 用 `${level_scd_dt}` 变量判断走哪条路径

## 4. 已知数据问题 / 坑

- **坑 1**:`level_id` 必须二次映射,不能直接当等级位(1~5)
- **坑 2**:**与会员主档的过滤口径不同**——拉链表不过滤 `deleted` 和 `op_type`,因为它是历史快照。这是它跟 `ods_member_info_scd` 最大的差异
- **坑 3**:`update_time` 相同时需要 `id DESC` 兜底,保证可复现
- **坑 4**:拉链表上线日之前的等级不在这里——必须用变更日志补齐
- **坑 5**:同一个 `(tenant_id, user_id, member_id)` 可能有多个 `level_id`(业务上同会员有跨等级历史),需要在 `member_level_info` CTE 里 `CASE WHEN` 二次映射

## 5. 引用记录

| 报表 / Change | 引用位置 | 引用日期 |
|---------------|----------|----------|
| dws_member_level_agg_1m | `member_level_rank_table` / `member_level_scd` CTE | 2026-09-28 |
