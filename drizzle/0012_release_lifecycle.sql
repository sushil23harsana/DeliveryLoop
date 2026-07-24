CREATE TABLE `release_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_by_member_id` text DEFAULT '' NOT NULL,
	`approved_by_role` text DEFAULT '' NOT NULL,
	`on_behalf_of` text DEFAULT '' NOT NULL,
	`approved_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`build` text DEFAULT '' NOT NULL,
	`exceptions` text DEFAULT '' NOT NULL,
	`open_items` text DEFAULT '[]' NOT NULL,
	`checklist_snapshot` text DEFAULT '[]' NOT NULL,
	`checklist_passed` integer DEFAULT 0 NOT NULL,
	`checklist_waived` integer DEFAULT 0 NOT NULL,
	`checklist_total` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_approvals_release_idx` ON `release_approvals` (`release_id`);
--> statement-breakpoint
INSERT INTO `release_approvals` (`id`,`release_id`,`approved_by`,`approved_at`,`version`,`build`,`exceptions`)
SELECT 'rapp-' || r.`id`, r.`id`, COALESCE(r.`approved_by`,''), COALESCE(r.`approved_at`, CURRENT_TIMESTAMP), r.`version`, r.`build`,
  COALESCE((SELECT a.`details` FROM `audit_events` a
    WHERE a.`entity_type` = 'release' AND a.`entity_id` = r.`id` AND a.`action` = 'Release approved'
    ORDER BY a.`created_at` DESC LIMIT 1), '')
FROM `releases` r WHERE r.`status` = 'Approved';
--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `state_by` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `state_at` text;
--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `state_note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `project_counters` (
	`project_id` text PRIMARY KEY NOT NULL,
	`next_ticket` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT INTO `project_counters` (`project_id`,`next_ticket`)
SELECT p.`id`, COALESCE((SELECT MAX(CAST(substr(t.`key`, instr(t.`key`,'-') + 1) AS INTEGER))
  FROM `tickets` t WHERE t.`project_id` = p.`id`), 0) + 1
FROM `projects` p;
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);
