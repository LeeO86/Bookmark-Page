<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

include 'db-conn.php';
if(isset($_POST['sort'])){
	$sort = $_POST['sort'];
	if($_POST['asc'] != 'false'){
		$dir = 'ASC';
	}else{
		$dir = 'DESC';
	}
}else{
	$sort = 'sort';
	$dir = 'ASC';
} 

$queryGroup = 'SELECT * From `groups` ORDER BY `groups`.`sort` ASC';

if (!$resultG = mysqli_query($con, $queryGroup)) {
    exit(mysqli_error($con));
}
$data = array();
$bookmarks = array();
$groupdata = array();

while($groupFetch = mysqli_fetch_assoc($resultG)) {
	$queryMarks = 'SELECT `B`.*, `G`.`id` AS Gid, `G`.name AS Gname FROM `bookmarks` `B` INNER JOIN `link-groups-bookmarks` `L` ON `B`.`id` = `L`.`bookmark-id` INNER JOIN `groups` `G` ON `L`.`group-id` = `G`.`id` WHERE `L`.`group-id` = '.$groupFetch['id'].' ORDER BY `B`.`'.$sort.'` '.$dir;
	$bmgroup = array();
	$group = array();
	$group['id'] = $groupFetch['id'];
	$group['sort'] = $groupFetch['sort'];
	$group['name'] = $groupFetch['name'];
	$group['remarks'] = $groupFetch['remarks'];
	$groupdata[$groupFetch['name']] = $group;
	
	if (!$resultBM = mysqli_query($con, $queryMarks)) {
	    exit(mysqli_error($con));
	}
	while($bmFetch = mysqli_fetch_assoc($resultBM)) {
		$bm = array();
		$bm['id'] = $bmFetch['id'];
		$bm['sort'] = $bmFetch['sort'];
		$bm['link'] = $bmFetch['link'];
		$bm['favicon'] = $bmFetch['favicon'];
		$bm['name'] = $bmFetch['name'];
		$bm['remarks'] = $bmFetch['remarks'];
		$bm['user1'] = $bmFetch['user1'];
		$bm['user2'] = $bmFetch['user2'];
		$bm['user3'] = $bmFetch['user3'];
		$bm['user4'] = $bmFetch['user4'];
		$bm['user5'] = $bmFetch['user5'];
		$bm['user6'] = $bmFetch['user6'];
		$bm['user7'] = $bmFetch['user7'];
		$bm['user8'] = $bmFetch['user8'];
		$bmgroup[] = $bm;
	}
	$bookmarks[$groupFetch['name']] = $bmgroup;
}
$data['bookmarks'] = $bookmarks;
$data['groupdata'] = $groupdata;

header('Content-Type: application/json');
echo json_encode($data);

mysqli_free_result($resultBM);
mysqli_free_result($resultG);
mysqli_close($con);

?>