-- 测试用例 C:渠道拉新统计(故意踩坑版)
-- 不要在生产环境执行,仅用于 data-quality 工具的功能验证
SELECT
  r.channel,
  COUNT(*)                                    AS register_cnt,
  COUNT(DISTINCT a.user_id)                   AS first_action_cnt,
  COUNT(DISTINCT a.user_id) / COUNT(*)        AS conversion_rate
FROM dwd_user_register_di r
JOIN dwd_user_first_action_di a
  ON r.user_id = a.user_id
GROUP BY r.channel
