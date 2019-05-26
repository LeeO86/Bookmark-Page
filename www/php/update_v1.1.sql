-- update bookmarks table
ALTER TABLE `bookmarks`  ADD `sort` INT(11) NOT NULL  AFTER `id`;
ALTER TABLE `bookmarks`  ADD `user1` TEXT NOT NULL  AFTER `remarks`,  ADD `user2` TEXT NOT NULL  AFTER `user1`,  ADD `user3` TEXT NOT NULL  AFTER `user2`,  ADD `user4` TEXT NOT NULL  AFTER `user3`,  ADD `user5` TEXT NOT NULL  AFTER `user4`,  ADD `user6` TEXT NOT NULL  AFTER `user5`,  ADD `user7` TEXT NOT NULL  AFTER `user6`,  ADD `user8` TEXT NOT NULL  AFTER `user7`;

-- update groups table
ALTER TABLE `groups`  ADD `sort` INT(11) NOT NULL  AFTER `id`;

-- update global table
INSERT INTO `global` (`key`, `value`) VALUES ('userCol', '0'), ('nameU1', 'Label 1');
INSERT INTO `global` (`key`, `value`) VALUES ('nameU2', 'Label 2'), ('nameU3', 'Label 3'), ('nameU4', 'Label 4'), ('nameU5', 'Label 5'), ('nameU6', 'Label 6'), ('nameU7', 'Label 8'), ('nameU8', 'Label 9');
INSERT INTO `global` (`key`, `value`) VALUES ('version', '1'), ('favcolor', 'faviconClear.ico');


-- update version in global;
UPDATE `global` SET `value` = '1.1' WHERE `global`.`key` = 'version';
