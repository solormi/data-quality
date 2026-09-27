-- 月度账单汇总报表
-- 用于查看 2026 年 9 月的账单数据汇总
SELECT
  user_id,
  amount,
  created_at
FROM orders
WHERE created_at BETWEEN '2026-09-01' AND '2026-09-30'
ORDER BY amount DESC