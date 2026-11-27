-- Weekly-off rules for a department or a designation (they win over shift and company rules).
ALTER TABLE `WeeklyOffRule` ADD COLUMN `departmentId` INTEGER NULL,
    ADD COLUMN `designationId` INTEGER NULL,
    ADD COLUMN `inherit` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `WeeklyOffRule_departmentId_idx` ON `WeeklyOffRule`(`departmentId`);
CREATE INDEX `WeeklyOffRule_designationId_idx` ON `WeeklyOffRule`(`designationId`);

ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_designationId_fkey` FOREIGN KEY (`designationId`) REFERENCES `Designation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
