ALTER TABLE `members` ADD COLUMN `notify_mode` TEXT NOT NULL DEFAULT 'standard';
--> statement-breakpoint
UPDATE `members` SET `notify_mode` = 'digest' WHERE `role` = 'client_viewer';
--> statement-breakpoint
ALTER TABLE `tickets` ADD COLUMN `reporter_id` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `tickets` SET `reporter_id` = COALESCE((SELECT m.`id` FROM `members` m WHERE m.`name` = `tickets`.`reporter`), '');
