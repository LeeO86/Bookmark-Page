<?php

// Connection variables 
$host = "db"; // MySQL host name eg. localhost
$user = "bookmark"; // MySQL user. eg. root ( if your on localserver)
$password = "bookpass"; // MySQL user password  (if password is not set for your root user then keep it empty )
$database = "bookmark-db"; // MySQL Database name

// Connect to MySQL Database
$con = new mysqli($host, $user, $password, $database);

// Check connection
if ($con->connect_error) {
    die("Connection failed: " . $con->connect_error);
}
?>