ALTER TABLE `entries` ADD `favicon_url` text;--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `favicon_cache` ADD `direct` integer DEFAULT false NOT NULL;