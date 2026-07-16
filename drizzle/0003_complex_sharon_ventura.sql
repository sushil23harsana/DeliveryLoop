CREATE INDEX IF NOT EXISTS `members_client_idx` ON `members` (`client_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rate_limit_actor_action_idx` ON `rate_limit_events` (`actor_id`,`action`,`created_at`);
