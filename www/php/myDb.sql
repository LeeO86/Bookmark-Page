-- phpMyAdmin SQL Dump
-- version 5.0.1
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Erstellungszeit: 08. Mrz 2020 um 02:36
-- Server-Version: 8.0.19
-- PHP-Version: 7.4.1

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Datenbank: `bookmark-db`
--
CREATE DATABASE IF NOT EXISTS `bookmark-db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `bookmark-db`;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `bookmarks`
--

DROP TABLE IF EXISTS `bookmarks`;
CREATE TABLE IF NOT EXISTS `bookmarks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sort` int NOT NULL,
  `link` varchar(255) NOT NULL,
  `favicon` varchar(255) NOT NULL,
  `name` varchar(64) NOT NULL,
  `remarks` text NOT NULL,
  `user1` text NOT NULL,
  `user2` text NOT NULL,
  `user3` text NOT NULL,
  `user4` text NOT NULL,
  `user5` text NOT NULL,
  `user6` text NOT NULL,
  `user7` text NOT NULL,
  `user8` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=COMPACT;

--
-- Daten für Tabelle `bookmarks`
--

INSERT INTO `bookmarks` (`id`, `sort`, `link`, `favicon`, `name`, `remarks`, `user1`, `user2`, `user3`, `user4`, `user5`, `user6`, `user7`, `user8`) VALUES
(1, 1, 'https://www.google.com', 'https://s2.googleusercontent.com/s2/favicons?domain_url=https://www.google.ch', 'Google', 'The Search-Engine', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `global`
--

DROP TABLE IF EXISTS `global`;
CREATE TABLE IF NOT EXISTS `global` (
  `key` text NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`key`(20))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Daten für Tabelle `global`
--

INSERT INTO `global` (`key`, `value`) VALUES
('background', 'grey'),
('claim', 'There is your claim'),
('favcolor', 'faviconClear.ico'),
('hideU1', '0'),
('hideU2', '0'),
('hideU3', '0'),
('hideU4', '0'),
('hideU5', '0'),
('hideU6', '0'),
('hideU7', '0'),
('hideU8', '0'),
('name', 'Bookmark Page'),
('nameU1', 'Label 1'),
('nameU2', 'Label 2'),
('nameU3', 'Label 3'),
('nameU4', 'Label 4'),
('nameU5', 'Label 5'),
('nameU6', 'Label 6'),
('nameU7', 'Label 7'),
('nameU8', 'Label 8'),
('refresh', '30'),
('userCol', '0'),
('version', '1.2.1');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `groups`
--

DROP TABLE IF EXISTS `groups`;
CREATE TABLE IF NOT EXISTS `groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sort` int NOT NULL,
  `name` text NOT NULL,
  `remarks` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=COMPACT;

--
-- Daten für Tabelle `groups`
--

INSERT INTO `groups` (`id`, `sort`, `name`, `remarks`) VALUES
(1, 1, 'Default-Group', '');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `link-groups-bookmarks`
--

DROP TABLE IF EXISTS `link-groups-bookmarks`;
CREATE TABLE IF NOT EXISTS `link-groups-bookmarks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group-id` int NOT NULL,
  `bookmark-id` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Daten für Tabelle `link-groups-bookmarks`
--

INSERT INTO `link-groups-bookmarks` (`id`, `group-id`, `bookmark-id`) VALUES
(1, 1, 1);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
