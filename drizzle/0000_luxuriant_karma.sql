CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`title` text NOT NULL,
	`state` text DEFAULT 'Not tested' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`accent` text DEFAULT '#625BF6' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`manager` text NOT NULL,
	`stage` text DEFAULT 'UAT' NOT NULL,
	`staging_url` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_unique` ON `projects` (`code`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`build` text NOT NULL,
	`status` text DEFAULT 'Testing' NOT NULL,
	`start_date` text NOT NULL,
	`due_date` text NOT NULL,
	`testing_notes` text DEFAULT '' NOT NULL,
	`approved_at` text,
	`approved_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`project_id` text NOT NULL,
	`release_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`actual` text NOT NULL,
	`expected` text NOT NULL,
	`severity` text NOT NULL,
	`priority` text NOT NULL,
	`status` text DEFAULT 'Submitted' NOT NULL,
	`reporter` text NOT NULL,
	`assignee` text DEFAULT 'Unassigned' NOT NULL,
	`page_url` text DEFAULT '' NOT NULL,
	`browser` text DEFAULT '' NOT NULL,
	`viewport` text DEFAULT '' NOT NULL,
	`build` text DEFAULT '' NOT NULL,
	`attachment_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_key_unique` ON `tickets` (`key`);