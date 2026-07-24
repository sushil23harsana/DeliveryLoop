CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`release_id` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'announcement' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`author_role` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `announcements_client_idx` ON `announcements` (`client_id`,`created_at`);
