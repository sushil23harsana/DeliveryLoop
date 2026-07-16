CREATE TABLE `rate_limit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `members` ADD `invited_by` text DEFAULT 'System' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `invited_at` text;--> statement-breakpoint
ALTER TABLE `members` ADD `last_seen_at` text;--> statement-breakpoint
ALTER TABLE `members` ADD `updated_at` text;