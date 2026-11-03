ALTER TABLE `favicon_cache` ADD `image_source` text DEFAULT 'fetched' NOT NULL;
--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `supplied_by` text;
--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `supplied_at` integer;
--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `failure_kind` text;
--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `retry_paused` integer DEFAULT 0 NOT NULL;
