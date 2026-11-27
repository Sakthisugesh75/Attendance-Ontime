-- The built-in HR role also manages expenses and assets.
UPDATE `AccessRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'expenses.manage') WHERE `systemKey` = 'HR' AND NOT JSON_CONTAINS(`permissions`, '"expenses.manage"');
UPDATE `AccessRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'assets.manage') WHERE `systemKey` = 'HR' AND NOT JSON_CONTAINS(`permissions`, '"assets.manage"');
