-- CreateTable
CREATE TABLE `LeaveQuotaRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leaveTypeId` INTEGER NOT NULL,
    `designationId` INTEGER NULL,
    `employeeId` INTEGER NULL,
    `yearlyQuota` DECIMAL(5, 1) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveQuotaRule_designationId_idx`(`designationId`),
    INDEX `LeaveQuotaRule_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `LeaveQuotaRule_leaveTypeId_designationId_employeeId_key`(`leaveTypeId`, `designationId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeaveQuotaRule` ADD CONSTRAINT `LeaveQuotaRule_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveQuotaRule` ADD CONSTRAINT `LeaveQuotaRule_designationId_fkey` FOREIGN KEY (`designationId`) REFERENCES `Designation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveQuotaRule` ADD CONSTRAINT `LeaveQuotaRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

