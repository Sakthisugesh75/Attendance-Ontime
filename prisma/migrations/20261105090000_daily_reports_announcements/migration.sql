-- Daily work reports, announcements, birthdays, requests entered by HR.

-- AlterTable
ALTER TABLE `Employee` ADD COLUMN `dateOfBirth` DATE NULL;

-- AlterTable
ALTER TABLE `AttendanceRequest` ADD COLUMN `enteredById` INTEGER NULL;

-- CreateTable
CREATE TABLE `DailyReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `tasks` JSON NOT NULL,
    `summary` VARCHAR(2000) NOT NULL DEFAULT '',
    `tomorrowPlan` VARCHAR(1000) NOT NULL DEFAULT '',
    `blockers` VARCHAR(1000) NOT NULL DEFAULT '',
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewComment` VARCHAR(500) NULL,

    INDEX `DailyReport_date_idx`(`date`),
    UNIQUE INDEX `DailyReport_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `body` VARCHAR(2000) NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `expiresOn` DATE NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Announcement_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AttendanceRequest` ADD CONSTRAINT `AttendanceRequest_enteredById_fkey` FOREIGN KEY (`enteredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DailyReport` ADD CONSTRAINT `DailyReport_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DailyReport` ADD CONSTRAINT `DailyReport_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The built-in Super Admin and HR roles get the two new permissions.
UPDATE `AccessRole` SET `permissions` = JSON_ARRAY_APPEND(JSON_ARRAY_APPEND(`permissions`, '$', 'dailyreports.review'), '$', 'announcements.manage')
WHERE `systemKey` IN ('SUPER_ADMIN', 'HR');
