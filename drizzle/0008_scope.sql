CREATE TABLE `scope_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`change_note` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`author_role` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scope_versions_project_version_idx` ON `scope_versions` (`project_id`,`version`);
