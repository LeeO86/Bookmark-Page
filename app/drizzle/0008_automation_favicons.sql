ALTER TABLE `api_tokens` ADD `managed_by` text;--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_managed_by_unique` ON `api_tokens` (`managed_by`);--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `failure_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `filters` ADD `scope` text;--> statement-breakpoint
ALTER TABLE `filters` ADD `external_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `filters_scope_external_key` ON `filters` (`scope`,`external_key`);