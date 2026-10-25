ALTER TABLE `user_preferences` ADD `facets_open` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `tile_size` text DEFAULT 'regular' NOT NULL;