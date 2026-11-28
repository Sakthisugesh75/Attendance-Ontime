# Database changes · 28 Nov 2026

One change, for the Android app's **arrival reminder**: punches made from the "You're at the office, tap to punch in"
notification are saved with a new source, **Arrival notification** (`ARRIVAL`). HR sees this in the muster day sheet
and the audit log.

It only adds a new allowed value, so existing records are untouched (they stay `WEB`, `IMPORT` or `MANUAL`).
The app download and update features use files in `storage/app/`, not the database.

## Run in phpMyAdmin

cPanel → **phpMyAdmin** → select the attendance database → **SQL** tab → paste → **Go**.

```sql
-- 1. New punch source for the arrival reminder
ALTER TABLE `AttendanceRecord`
  MODIFY `source` ENUM('WEB', 'IMPORT', 'MANUAL', 'ARRIVAL') NOT NULL DEFAULT 'WEB';

-- 2. Record it as applied, so `npx prisma migrate deploy` won't try to run it again
INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
VALUES
  (UUID(), '5f778987ef7dbc08372201790bfe027dde158d6ce46054cd08f9d6dba43de0db', NOW(3),
   '20261128090000_arrival_punch_source', NULL, NULL, NOW(3), 1);
```

- Keep the capitals exactly as written (`AttendanceRecord`): Linux hosting treats table names as case-sensitive.
- Run step 2 only if the database has a `_prisma_migrations` table (it does if it was set up with Prisma).
- If you deploy with `npx prisma migrate deploy` on the server instead, skip both steps: that command applies
  `prisma/migrations/20261128090000_arrival_punch_source/migration.sql` by itself.

## Check the server has the earlier updates

If the database was set up a while ago, it may also be missing the 27 Nov updates. Run:

```sql
SELECT `migration_name` FROM `_prisma_migrations` ORDER BY `migration_name`;
```

The last three names should be:

```
20261127070000_hr_expense_asset_permissions
20261127100000_weekly_off_by_group
20261128090000_arrival_punch_source
```

If a 27 Nov one is missing, its SQL is in `prisma/migrations/<name>/migration.sql`. Check it before running: SQL
generated on the WAMP machine can use lowercase table names (such as `dailyreport` instead of `DailyReport`), which
fail on Linux hosting. Use the exact capitals from `prisma/schema.prisma`.

## Undo (only if needed)

Only possible while no punch has been saved with the new source:

```sql
SELECT COUNT(*) FROM `AttendanceRecord` WHERE `source` = 'ARRIVAL';  -- must be 0

ALTER TABLE `AttendanceRecord`
  MODIFY `source` ENUM('WEB', 'IMPORT', 'MANUAL') NOT NULL DEFAULT 'WEB';
DELETE FROM `_prisma_migrations` WHERE `migration_name` = '20261128090000_arrival_punch_source';
```
