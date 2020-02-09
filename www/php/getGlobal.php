<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

include 'db-conn.php';

$query = 'SELECT * From global';
if (!$result = mysqli_query($con, $query)) {
    exit(mysqli_error($con));
}
$data = array();

while($row = mysqli_fetch_assoc($result)) {
	$data[$row['key']] = $row['value'];
}

header('Content-Type: application/json');
echo json_encode($data);

mysqli_free_result($result);
mysqli_close($con);

?>