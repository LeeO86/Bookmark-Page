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

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `bookmarks`
--

CREATE TABLE `bookmarks` (
  `id` int(11) NOT NULL,
  `link` varchar(255) NOT NULL,
  `favicon` varchar(255) NOT NULL,
  `name` varchar(64) NOT NULL,
  `remarks` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=COMPACT;

--
-- Daten für Tabelle `bookmarks`
--

INSERT INTO `bookmarks` (`id`, `link`, `favicon`, `name`, `remarks`) VALUES
(1, 'https://www.google.com', 'https://s2.googleusercontent.com/s2/favicons?domain_url=https://www.google.ch', 'Google', 'The Search-Engine');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `global`
--

CREATE TABLE `global` (
  `key` text NOT NULL,
  `value` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Daten für Tabelle `global`
--

INSERT INTO `global` (`key`, `value`) VALUES
('claim', 'There is your claim'),
('name', 'Bookmark Page'),
('refresh', '30');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `groups`
--

CREATE TABLE `groups` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=COMPACT;

--
-- Daten für Tabelle `groups`
--

INSERT INTO `groups` (`id`, `name`) VALUES
(1, 'Default-Group');

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `link-groups-bookmarks`
--

CREATE TABLE `link-groups-bookmarks` (
  `id` int(11) NOT NULL,
  `group-id` int(11) NOT NULL,
  `bookmark-id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Daten für Tabelle `link-groups-bookmarks`
--

INSERT INTO `link-groups-bookmarks` (`id`, `group-id`, `bookmark-id`) VALUES
(1, 1, 1);

--
-- Indizes der exportierten Tabellen
--

--
-- Indizes für die Tabelle `bookmarks`
--
ALTER TABLE `bookmarks`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `global`
--
ALTER TABLE `global`
  ADD PRIMARY KEY (`key`(20));

--
-- Indizes für die Tabelle `groups`
--
ALTER TABLE `groups`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `link-groups-bookmarks`
--
ALTER TABLE `link-groups-bookmarks`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT für exportierte Tabellen
--

--
-- AUTO_INCREMENT für Tabelle `bookmarks`
--
ALTER TABLE `bookmarks`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT für Tabelle `groups`
--
ALTER TABLE `groups`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT für Tabelle `link-groups-bookmarks`
--
ALTER TABLE `link-groups-bookmarks`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;