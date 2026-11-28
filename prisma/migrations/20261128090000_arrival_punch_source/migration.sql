-- Punch-ins made from the native app's office-arrival notification.
ALTER TABLE `AttendanceRecord` MODIFY `source` ENUM('WEB', 'IMPORT', 'MANUAL', 'ARRIVAL') NOT NULL DEFAULT 'WEB';
