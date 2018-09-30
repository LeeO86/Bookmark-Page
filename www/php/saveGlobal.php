<?php
if(isset($_POST['title']) && isset($_POST['claim']) && isset($_POST['refresh'])){
	include 'db-conn.php';
	$name = $_POST['title'];
	$claim = $_POST['claim'];
	$refresh = $_POST['refresh'];

	$insert[0] = 'UPDATE `global` SET `value` = "'.$name.'" WHERE `global`.`key` = "name"';
	$insert[1] = ' UPDATE `global` SET `value` = "'.$claim.'" WHERE `global`.`key` = "claim"';
	$insert[2] = ' UPDATE `global` SET `value` = "'.$refresh.'" WHERE `global`.`key` = "refresh"';

	foreach ($insert as $query) {
		if (!$result = mysqli_query($con, $query)) {
	    	exit(mysqli_error($con));
		}
	}
	
	var_dump(http_response_code(200));
	echo("OK");

	mysqli_close($con);
}else{
	var_dump(http_response_code(400));
	echo("HTTP-POST ERROR");
}

?>