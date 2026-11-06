ALTER TABLE `users` ADD `oidc_role_diagnostics` text;
--> statement-breakpoint
UPDATE `favicon_cache` SET `status` = 'ok', `error` = NULL, `failure_count` = 0, `failure_kind` = NULL, `retry_paused` = 0 WHERE `image_source` = 'supplied' AND `data` IS NOT NULL;
