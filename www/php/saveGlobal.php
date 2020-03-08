<?php
/*
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

if(isset($_POST['title']) && isset($_POST['claim']) && isset($_POST['refresh']) && isset($_POST['favcolor']) && isset($_POST['background']) && isset($_POST['userCol'])){
	include 'db-conn.php';
	$name = $_POST['title'];
	$claim = $_POST['claim'];
	$refresh = $_POST['refresh'];
	$favcolor = $_POST['favcolor'];
	$background = $_POST['background'];
	$usercol = $_POST['userCol'];
	$nameU1 = $_POST['nameU1'];
	$nameU2 = $_POST['nameU2'];
	$nameU3 = $_POST['nameU3'];
	$nameU4 = $_POST['nameU4'];
	$nameU5 = $_POST['nameU5'];
	$nameU6 = $_POST['nameU6'];
	$nameU7 = $_POST['nameU7'];
	$nameU8 = $_POST['nameU8'];
	$hideU1 = $_POST['hideU1'];
	$hideU2 = $_POST['hideU2'];
	$hideU3 = $_POST['hideU3'];
	$hideU4 = $_POST['hideU4'];
	$hideU5 = $_POST['hideU5'];
	$hideU6 = $_POST['hideU6'];
	$hideU7 = $_POST['hideU7'];
	$hideU8 = $_POST['hideU8'];

	$insert[0] = 'UPDATE `global` SET `value` = "'.$name.'" WHERE `global`.`key` = "name"';
	$insert[1] = ' UPDATE `global` SET `value` = "'.$claim.'" WHERE `global`.`key` = "claim"';
	$insert[2] = ' UPDATE `global` SET `value` = "'.$refresh.'" WHERE `global`.`key` = "refresh"';
	$insert[3] = ' UPDATE `global` SET `value` = "'.$favcolor.'" WHERE `global`.`key` = "favcolor"';
	$insert[4] = ' UPDATE `global` SET `value` = "'.$background.'" WHERE `global`.`key` = "background"';
	$insert[5] = ' UPDATE `global` SET `value` = "'.$usercol.'" WHERE `global`.`key` = "userCol"';
	$insert[6] = ' UPDATE `global` SET `value` = "'.$nameU1.'" WHERE `global`.`key` = "nameU1"';
	$insert[7] = ' UPDATE `global` SET `value` = "'.$nameU2.'" WHERE `global`.`key` = "nameU2"';
	$insert[8] = ' UPDATE `global` SET `value` = "'.$nameU3.'" WHERE `global`.`key` = "nameU3"';
	$insert[9] = ' UPDATE `global` SET `value` = "'.$nameU4.'" WHERE `global`.`key` = "nameU4"';
	$insert[10] = ' UPDATE `global` SET `value` = "'.$nameU5.'" WHERE `global`.`key` = "nameU5"';
	$insert[11] = ' UPDATE `global` SET `value` = "'.$nameU6.'" WHERE `global`.`key` = "nameU6"';
	$insert[12] = ' UPDATE `global` SET `value` = "'.$nameU7.'" WHERE `global`.`key` = "nameU7"';
	$insert[13] = ' UPDATE `global` SET `value` = "'.$nameU8.'" WHERE `global`.`key` = "nameU8"';
	$insert[14] = ' UPDATE `global` SET `value` = "'.$hideU1.'" WHERE `global`.`key` = "hideU1"';
	$insert[15] = ' UPDATE `global` SET `value` = "'.$hideU2.'" WHERE `global`.`key` = "hideU2"';
	$insert[16] = ' UPDATE `global` SET `value` = "'.$hideU3.'" WHERE `global`.`key` = "hideU3"';
	$insert[17] = ' UPDATE `global` SET `value` = "'.$hideU4.'" WHERE `global`.`key` = "hideU4"';
	$insert[18] = ' UPDATE `global` SET `value` = "'.$hideU5.'" WHERE `global`.`key` = "hideU5"';
	$insert[19] = ' UPDATE `global` SET `value` = "'.$hideU6.'" WHERE `global`.`key` = "hideU6"';
	$insert[20] = ' UPDATE `global` SET `value` = "'.$hideU7.'" WHERE `global`.`key` = "hideU7"';
	$insert[21] = ' UPDATE `global` SET `value` = "'.$hideU8.'" WHERE `global`.`key` = "hideU8"';

	foreach ($insert as $query) {
		if (!$result = mysqli_query($con, $query)) {
	    	exit(mysqli_error($con));
		}
	}
	
	http_response_code(200);
	echo("OK");

	mysqli_close($con);
}else{
	http_response_code(400);
	echo("HTTP-POST ERROR");
}

?>