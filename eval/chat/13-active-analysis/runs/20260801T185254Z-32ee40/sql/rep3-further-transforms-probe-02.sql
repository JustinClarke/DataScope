SELECT t1."country" AS label, ROUND(COUNT(DISTINCT t0."order_id"), 2) AS value FROM "orders" t0 LEFT JOIN "customers" t1 ON t0."customer_id" = t1."customer_id" GROUP BY 1 ORDER BY label ASC LIMIT 101
