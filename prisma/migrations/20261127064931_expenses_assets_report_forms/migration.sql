-- AlterTable
ALTER TABLE `DailyReport` ADD COLUMN `answers` JSON NULL;

-- CreateTable
CREATE TABLE `LeaveTypeDesignation` (
    `leaveTypeId` INTEGER NOT NULL,
    `designationId` INTEGER NOT NULL,

    INDEX `LeaveTypeDesignation_designationId_idx`(`designationId`),
    PRIMARY KEY (`leaveTypeId`, `designationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(60) NOT NULL,
    `defaultLimit` DECIMAL(10, 2) NULL,
    `receiptRequired` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExpenseCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseLimit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoryId` INTEGER NOT NULL,
    `designationId` INTEGER NOT NULL,
    `maxAmount` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `ExpenseLimit_categoryId_designationId_key`(`categoryId`, `designationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseClaim` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `expenseDate` DATE NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `description` VARCHAR(1000) NOT NULL,
    `receiptPath` VARCHAR(255) NULL,
    `status` ENUM('PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_MANAGER',
    `managerById` INTEGER NULL,
    `managerByName` VARCHAR(150) NULL,
    `managerAt` DATETIME(3) NULL,
    `managerComment` VARCHAR(500) NULL,
    `hrById` INTEGER NULL,
    `hrByName` VARCHAR(150) NULL,
    `hrAt` DATETIME(3) NULL,
    `hrComment` VARCHAR(500) NULL,
    `paidById` INTEGER NULL,
    `paidByName` VARCHAR(150) NULL,
    `paidAt` DATETIME(3) NULL,
    `paymentRef` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExpenseClaim_employeeId_expenseDate_idx`(`employeeId`, `expenseDate`),
    INDEX `ExpenseClaim_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tag` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `serialNo` VARCHAR(100) NULL,
    `purchaseDate` DATE NULL,
    `cost` DECIMAL(10, 2) NULL,
    `status` ENUM('AVAILABLE', 'ASSIGNED', 'REPAIR', 'RETIRED') NOT NULL DEFAULT 'AVAILABLE',
    `condition` ENUM('NEW', 'GOOD', 'FAIR', 'DAMAGED') NOT NULL DEFAULT 'GOOD',
    `notes` VARCHAR(1000) NOT NULL DEFAULT '',
    `employeeId` INTEGER NULL,
    `assignedAt` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Asset_tag_key`(`tag`),
    INDEX `Asset_status_idx`(`status`),
    INDEX `Asset_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assetId` INTEGER NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `employeeId` INTEGER NULL,
    `condition` ENUM('NEW', 'GOOD', 'FAIR', 'DAMAGED') NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `actorId` INTEGER NULL,
    `actorName` VARCHAR(150) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssetEvent_assetId_createdAt_idx`(`assetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sections` JSON NOT NULL,
    `fields` JSON NOT NULL,
    `designationIds` JSON NOT NULL,
    `departmentIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeaveTypeDesignation` ADD CONSTRAINT `LeaveTypeDesignation_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveTypeDesignation` ADD CONSTRAINT `LeaveTypeDesignation_designationId_fkey` FOREIGN KEY (`designationId`) REFERENCES `Designation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseLimit` ADD CONSTRAINT `ExpenseLimit_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseLimit` ADD CONSTRAINT `ExpenseLimit_designationId_fkey` FOREIGN KEY (`designationId`) REFERENCES `Designation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseClaim` ADD CONSTRAINT `ExpenseClaim_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseClaim` ADD CONSTRAINT `ExpenseClaim_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetEvent` ADD CONSTRAINT `AssetEvent_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetEvent` ADD CONSTRAINT `AssetEvent_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Starter data: the default daily report form matches the form used so far.
INSERT INTO `ReportTemplate` (`name`, `isDefault`, `sections`, `fields`, `designationIds`, `departmentIds`, `updatedAt`) VALUES
  ('Standard report', true,
   '{"tasks":true,"summary":{"on":true,"label":"Summary"},"tomorrowPlan":{"on":true,"label":"Plan for tomorrow"},"blockers":{"on":true,"label":"Blockers"}}',
   '[]', '[]', '[]', CURRENT_TIMESTAMP(3));

INSERT INTO `ExpenseCategory` (`name`, `defaultLimit`, `receiptRequired`) VALUES
  ('Travel', NULL, true),
  ('Fuel', NULL, true),
  ('Food', 500.00, false),
  ('Accommodation', NULL, true),
  ('Office supplies', NULL, true),
  ('Phone & internet', NULL, true),
  ('Other', NULL, true);
