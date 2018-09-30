<?php
include 'db-conn.php';

$queryGroup = 'SELECT * From `groups`';

if (!$resultG = mysqli_query($con, $queryGroup)) {
    exit(mysqli_error($con));
}
$data = array();

while($groupFetch = mysqli_fetch_assoc($resultG)) {
	$queryMarks = 'SELECT `B`.*, `G`.`id` AS Gid, `G`.name AS Gname FROM `bookmarks` `B` INNER JOIN `link-groups-bookmarks` `L` ON `B`.`id` = `L`.`bookmark-id` INNER JOIN `groups` `G` ON `L`.`group-id` = `G`.`id` WHERE `L`.`group-id` = '.$groupFetch['id'];
	$group = array();
	if (!$resultBM = mysqli_query($con, $queryMarks)) {
	    exit(mysqli_error($con));
	}
	while($bmFetch = mysqli_fetch_assoc($resultBM)) {
		$bm = array();
		$bm['id'] = $bmFetch['id'];
		$bm['link'] = $bmFetch['link'];
		$bm['favicon'] = $bmFetch['favicon'];
		$bm['name'] = $bmFetch['name'];
		$bm['remarks'] = $bmFetch['remarks'];
		$group[] = $bm;
	}
	$data[$groupFetch['name']] = $group;
}

header('Content-Type: application/json');
echo json_encode($data);

mysqli_free_result($resultBM);
mysqli_free_result($resultG);
mysqli_close($con);

?>