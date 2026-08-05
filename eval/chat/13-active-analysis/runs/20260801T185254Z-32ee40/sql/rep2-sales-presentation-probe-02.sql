SELECT t1."category" AS label, ROUND(SUM(t0."quantity"), 2) AS value FROM "order_items" t0 LEFT JOIN "products" t1 ON t0."product_id" = t1."product_id" GROUP BY 1 ORDER BY label ASC LIMIT 101
