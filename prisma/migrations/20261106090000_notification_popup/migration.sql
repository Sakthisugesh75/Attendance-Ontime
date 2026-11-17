-- Reminders shown as in-app pop-ups.

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `popup` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `popupAfter` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Notification_userId_popup_idx` ON `Notification`(`userId`, `popup`);
