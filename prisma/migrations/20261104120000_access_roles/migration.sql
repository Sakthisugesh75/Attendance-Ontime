-- Roles & permissions managed by the Super Admin.

-- CreateTable
CREATE TABLE `AccessRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(300) NOT NULL DEFAULT '',
    `permissions` JSON NOT NULL,
    `scope` ENUM('ALL', 'TEAM', 'SELF') NOT NULL DEFAULT 'SELF',
    `systemKey` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AccessRole_name_key`(`name`),
    UNIQUE INDEX `AccessRole_systemKey_key`(`systemKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `accessRoleId` INTEGER NULL,
    ADD COLUMN `lastSeenAt` DATETIME(3) NULL,
    ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_accessRoleId_fkey` FOREIGN KEY (`accessRoleId`) REFERENCES `AccessRole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Built-in roles: exactly what the three fixed roles could do before.
INSERT INTO `AccessRole` (`name`, `description`, `permissions`, `scope`, `systemKey`, `updatedAt`) VALUES
  ('Super Admin', 'Owner account: every permission, everyone''s data',
   JSON_ARRAY('dashboard.org','attendance.view','attendance.edit','requests.approve','employees.view','employees.manage','holidays.manage','reports.view','reports.export','import.run','settings.manage','audit.view','access.manage'),
   'ALL', 'SUPER_ADMIN', CURRENT_TIMESTAMP(3)),
  ('HR / Manager', 'Runs day-to-day attendance for the whole company',
   JSON_ARRAY('dashboard.org','attendance.view','attendance.edit','requests.approve','employees.view','employees.manage','holidays.manage','reports.view','reports.export','import.run'),
   'ALL', 'HR', CURRENT_TIMESTAMP(3)),
  ('Employee', 'Own attendance and requests only', JSON_ARRAY(), 'SELF', 'EMPLOYEE', CURRENT_TIMESTAMP(3));

-- Everyone keeps the access they had.
UPDATE `User` u JOIN `AccessRole` r ON r.`systemKey` = u.`role` SET u.`accessRoleId` = r.`id`;
