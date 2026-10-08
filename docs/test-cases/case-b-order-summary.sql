-- 测试用例 B:订单金额汇总(故意踩坑版)
-- 不要在生产环境执行,仅用于 data-quality 工具的功能验证
SELECT
  user_id,
  COUNT(*)           AS order_cnt,
  SUM(amount)        AS total_amount_yuan
FROM dwd_orders_di
WHERE created_at BETWEEN '2026-09-01' AND '2026-09-30'
GROUP BY user_id
