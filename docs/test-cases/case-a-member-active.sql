-- 测试用例 A:会员活跃度日报(故意踩坑版)
-- 不要在生产环境执行,仅用于 data-quality 工具的功能验证
SELECT
  channel,
  COUNT(DISTINCT user_id)        AS active_member_cnt,
  AVG(duration_sec)              AS avg_duration_sec
FROM dwd_member_active_di
WHERE active_date = '2026-10-01'
GROUP BY channel
ORDER BY active_member_cnt DESC
