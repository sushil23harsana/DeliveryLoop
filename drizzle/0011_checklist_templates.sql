CREATE TABLE `checklist_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`items` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
