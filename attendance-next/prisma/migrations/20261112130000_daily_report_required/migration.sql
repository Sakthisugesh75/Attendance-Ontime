-- AlterTable
ALTER TABLE `AccessRole` ADD COLUMN `dailyReports` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Employee` ADD COLUMN `reportRequired` BOOLEAN NULL;

