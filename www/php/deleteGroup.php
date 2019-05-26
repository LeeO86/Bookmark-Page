<?php
if(isset($_POST['groupname'])){
	include 'db-conn.php';
	$name = $_POST['groupname'];

    $delete = 'DELETE `B`, `G`, `L` FROM `bookmarks` `B` INNER JOIN `link-groups-bookmarks` `L` ON `B`.`id` = `L`.`bookmark-id` INNER JOIN `groups` `G` ON `L`.`group-id` = `G`.`id` WHERE `G`.name = "'.$name.'"';
    if (!$result = mysqli_query($con, $delete)) {
        exit(mysqli_error($con));
    }
	
	http_response_code(200);
	echo("OK");

	mysqli_close($con);
}else{
	http_response_code(400);
	echo("HTTP-POST ERROR");
}

?>