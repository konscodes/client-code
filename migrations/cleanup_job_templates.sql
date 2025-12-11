-- Delete job templates that match jobs used only 1 time
-- Keep templates matching jobs used 2+ times
-- Target: Yandex Cloud self-hosted Supabase instance (supabase.service-mk.ru)
-- Expected reduction: ~5,447 templates deleted (from 6,180 to ~733 templates)

DELETE FROM job_templates
WHERE id IN (
  SELECT jt.id
  FROM job_templates jt
  LEFT JOIN (
    SELECT 
      "jobName",
      COUNT(*) as usage_count
    FROM order_jobs
    WHERE "jobName" IS NOT NULL AND "jobName" != ''
    GROUP BY "jobName"
  ) usage_stats ON LOWER(TRIM(jt.name)) = LOWER(TRIM(usage_stats."jobName"))
  WHERE COALESCE(usage_stats.usage_count, 0) = 1
);

