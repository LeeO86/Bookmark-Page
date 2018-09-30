<?php
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