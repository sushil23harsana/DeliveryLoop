DELETE FROM `comments` WHERE `id` IN ('comment-1', 'comment-2', 'comment-3', 'comment-4');
--> statement-breakpoint
DELETE FROM `checklist_items` WHERE `id` IN ('check-1', 'check-2', 'check-3', 'check-4', 'check-5', 'check-6', 'check-7', 'check-8');
--> statement-breakpoint
DELETE FROM `tickets` WHERE `id` IN ('ticket-1', 'ticket-2', 'ticket-3', 'ticket-4', 'ticket-5', 'ticket-6', 'ticket-7', 'ticket-8');
--> statement-breakpoint
DELETE FROM `audit_events` WHERE `id` IN ('audit-1', 'audit-2');
--> statement-breakpoint
DELETE FROM `rate_limit_events` WHERE `actor_id` IN ('member-demo-admin', 'member-northstar', 'member-atlas', 'member-veda');
--> statement-breakpoint
DELETE FROM `members` WHERE `id` IN ('member-demo-admin', 'member-northstar', 'member-atlas', 'member-veda');
--> statement-breakpoint
DELETE FROM `releases` WHERE `id` IN ('release-checkout', 'release-booking', 'release-payouts');
--> statement-breakpoint
DELETE FROM `projects` WHERE `id` IN ('project-northstar', 'project-atlas', 'project-veda');
--> statement-breakpoint
DELETE FROM `clients` WHERE `id` IN ('client-northstar', 'client-atlas', 'client-veda');
