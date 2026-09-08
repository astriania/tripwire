<?php
function update_database() {	
	global $db_update_diffs, $mysql_update, $mysql;
	
	$version = 0;

	$version_file = dirname( __FILE__ ) . "/cache/db-update-state.php";
	if ( file_exists( $version_file ) ) {
		include $version_file;
	}

	$new_version = count($db_update_diffs);
	if($new_version > $version) {
		// May need an update.
		if(!isset($mysql_update)) {
			die('Tripwire\'s database needs to be updated, but no update connection is configured.');
		}
		
		// Use the version file itself as a lock as well
		$fp = fopen($version_file, 'c+');
		flock($fp, LOCK_EX);
		
		// Reread the file to see if another request did the update while we were waiting on the lock
		$prefix = '<?php $version = ';
		$content = fread($fp, 1e6);
		$rechecked_version = intval(substr($content, strlen($prefix), -1));
		if($rechecked_version >= $new_version) { return false; }
		
		// Run the updates
		// You would expect this to be in a transaction, but in MySQL, create/alter queries break a transaction anyway
		try {
			for($i = $version; $i < $new_version; $i++) {
				$diff = $db_update_diffs[$i];
				
				$stmt = $mysql_update->prepare($diff);
				$stmt->execute();	
				$stmt = $mysql_update->prepare('insert into update_history (diff_index, applied_at) values (:diff_index, :applied_at) on duplicate key update diff_index=diff_index');
				$stmt->execute(['diff_index' => $i, 'applied_at' => date("Y-m-d H:i:s")]);
				
				// Update the version file
				$run = $i + 1;
				fseek($fp, 0);
				fwrite($fp, "$prefix$run;");
			}
		} catch(Exception $e) {
			error_log($e->getMessage());
			die('Error attempting to apply DB updates. Please ask your Tripwire admin to check database config.');
		}		
	} else { return false; }
}

$db_update_diffs = [
		'CREATE TABLE if not exists `update_history` (
			`diff_index` int PRIMARY KEY,
			`applied_at` TIMESTAMP NOT NULL
		)',
		'alter table wormholes modify column `life` varchar(32)',
		'alter table flares 
			add column lifeLength int not null default 86400,
			add column reason varchar(255) null',
		'alter event flaresClean DO DELETE FROM flares WHERE lifeLength is not null and DATE_ADD(time, INTERVAL lifeLength second) < NOW()',
		'alter table flares modify column lifeLength int null', // this is two diffs to set the default 1 day on existing records
		"alter table signatures add column scan_group enum('anomaly', 'signature') after type",
		'alter table tracking add column online int not null default 0 after characterName',
		'alter table tracking modify column stationID bigint null',
];

// Don't retry in the same session, to avoid reading the file every time
if(!($_SESSION['applied_db_updates'] ?? false)) {
	update_database();
	//$_SESSION['applied_db_updates'] = true;
}
?>