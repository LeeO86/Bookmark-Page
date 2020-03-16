/*!
 * Bookmark-Page (https://github.com/LeeO86/Bookmark-Page)
 *
 * Copyright 2020 Adrian Hilber
 * Licensed under MIT (https://github.com/LeeO86/Bookmark-Page/blob/master/LICENSE)
 */

// Gloal Vars
var Global = {};
var GroupData = {};
var Bookmarks = {};
var RefreshTimer = false;
var RefreshChangedString = '';
var Sort = {row: 'sort', asc: true};
var Numbers = {};
var GroupHide = {};
var AltPressed = false;
var ShiftPressed = false;
var Mouseovered = false;
var BMP_Version = '1.2.2';

// Functions
function loadPage(callback){
	RefreshChangedString = '';
	var fullReload = false;
	$.get('php/getGlobal.php', {}, function (ret, status){
		if(JSON.stringify(ret) !== JSON.stringify(Global)){
			RefreshChangedString += ret.name+' Loaded Globals\n';
			fullReload = true;
			Global = ret;
		}
		if($.isEmptyObject(Global)){
			$('#bookmarks').empty().html('ooops! There is an MySQL-DB Error!<br>Call your System-Administrator or check Console...');
			console.log('There is an MySQL-DB Error! Log in to the PHPmyAdmin Page an check if there is a bookmark-db. If not insert ../dump/myDb.sql');
			feather.replace();
			return;
		}else if(Global.version !== BMP_Version){
			$('#bookmarks').empty().html('<h4>ooops! You have to update your MySQL-DB!</h4><p>Call your System-Administrator...</p><small class="text-muted">You can update your DB but probably you want to save your bookmarks DB before via the PHPmyAdmin Console... <br/> Page-Version: v'+BMP_Version+' | DB-Version: v'+Global.version+'</small><div class="text-center"><button type="button" onclick="updateDB();" class="btn btn-outline-danger mt-3 ml-2">Update ?</button></div>');
			console.log('You have to update your MySQL-DB! You can update your DB but probably you want to save your bookmark-db before via the PHPmyAdmin Console...\nPage-Version: v'+BMP_Version+' | DB-Version: v'+Global.version);
			feather.replace();
			return;
		}
		if(RefreshChangedString){
			document.title = Global.name;
			$('#page-name').text(Global.name);
			$('#pageClaim').text(Global.claim);
			changeBg(Global.background);
		}
		if(!RefreshTimer)
			RefreshTimer = setInterval(function(){ $('[data-toggle="tooltip"]').tooltip('hide'); loadPage(refreshCallback);}, (parseInt(Global.refresh)*1000));
	
		$.post('php/getBookmarks.php', {
			sort: Sort.row,
			asc: Sort.asc

		}, function (ret, status){
			if(JSON.stringify(ret.bookmarks) !== JSON.stringify(Bookmarks) || JSON.stringify(ret.groupdata) !== JSON.stringify(GroupData) || fullReload){
				Bookmarks = ret.bookmarks;
				GroupData = ret.groupdata;
				Numbers = {};
				var sendBMSort = {};
				var html = '<table class="table table-hover"><thead><th style="width: 50px;" id="S-sort"><span class="SortIndex" id="SI-sort"></span></th><th id="S-name">Name<span class="SortIndex" id="SI-name"></span></th><th id="S-remarks">Remarks<span class="SortIndex" id="SI-remarks"></span></th>'
				for (var i = 1; i <= Global.userCol; i++) {
					if(Global['hideU'+i] === '0'){
						html += '<th id="S-user'+i+'" onclick="sort(\'user'+i+'\');">'+Global['nameU'+i]+'<span class="SortIndex" id="SI-user'+i+'"></span></th>';
					}
				}
				html += '</thead><tbody id="searchData">';
				var colspanNr = (parseInt(Global.userCol)+1);
				var gcid = 0;
				Numbers.totalBMs = 0;
				for (gName in Bookmarks){
					html += '<tr class="GroupTitle" onclick="toggleGroup(\'g-'+gcid+'\');"><td id="gI-g-'+gcid+'" class="GroupIcon"><i data-feather="chevron-up" width="20" height="20"></i></td><th>'+gName+'</th><td colspan="'+colspanNr+'" scope="row">'+GroupData[gName].remarks+'</td></tr>';
					$.each(Bookmarks[gName], function(i, bookmark){
						html += '<tr id="bm-'+bookmark.id+'" class="g-'+gcid+'" onclick="openInNewTab(\''+bookmark.link+'\');" data-toggle="tooltip" title="URL: '+bookmark.link+'"><td><img class="bm-img" src="'+bookmark.favicon+'" onerror="this.onerror=null; this.src=\'img/errorfav.svg\'"></img></td><td>'+bookmark.name+'</td><td>'+bookmark.remarks+'</td>';
						for (var j = 1; j <= Global.userCol; j++) {
							html += '<td'
							if(Global['hideU'+j] !== '0')	html += ' style="display: none;"'
							html += '>'+bookmark['user'+j]+'</td>';
						}
						html += '</tr>';
						Numbers[gName] = i+1;
						Numbers.totalBMs++;
						if(Sort.row == 'sort' && Sort.asc && bookmark.sort != i+1){
							sendBMSort[bookmark.id] = i+1;
						}
					});
					gcid++;
				}
				Numbers.groups = gcid;
				html += '</tbody></table>';
				$('#bookmarks').empty().html(html);
				RefreshChangedString += 'Loaded '+Numbers.totalBMs+' Bookmarks in '+Numbers.groups+' Groups';
				if(Sort.asc){
					if(Sort.row != 'sort'){
						$('#SI-'+Sort.row).html('<i data-feather="chevron-down" width="20" height="20" class="ml-2"></i>');
					}
				}else{
					$('#SI-'+Sort.row).html('<i data-feather="chevron-up" width="20" height="20" class="ml-2"></i>');
				}
				$('[data-toggle="tooltip"]').tooltip({placement: "top", delay: { "show": 1500, "hide": 10 }});
				reToggleGroup();
				feather.replace();
				$('#S-sort').click(function(){sort('sort');});
				$('#S-name').click(function(){sort('name');});
				$('#S-remarks').click(function(){sort('remarks');});
				if(!$.isEmptyObject(sendBMSort)){
					$.post('php/saveBMsort.php', {
						json: JSON.stringify(sendBMSort)

					}, function (ret, status){
						console.log("SaveBM-Sort Req-Answer Data: "+ret+", Status: "+status);
						if(ret == 'OK'){
							stopRefresh();
							loadPage(refreshCallback);
						}
					});
				}
			}else{
				$('.SortIndex').empty();
				if(Sort.asc){
					if(Sort.row != 'sort'){
						$('#SI-'+Sort.row).html('<i data-feather="chevron-down" width="20" height="20" class="ml-2"></i>');
					}
				}else{
					$('#SI-'+Sort.row).html('<i data-feather="chevron-up" width="20" height="20" class="ml-2"></i>');
				}
				for (gName in Bookmarks){
					$.each(Bookmarks[gName], function(i, bm){
						$('#bm-'+bm.id+' .bm-img').attr({'src':bm.favicon, 'onerror':'this.onerror=null; this.src="img/errorfav.svg"'});
					});
				}
				feather.replace();
			}
			if(!RefreshChangedString){
				console.log('Page-Reload: Nothing changed but BM-Icons reloaded.');
			}else{
				console.log(RefreshChangedString);
			}
			if(typeof(callback) === typeof(Function) && RefreshChangedString)
				callback();
		});
	});
}

function sort(row){
	if(row === Sort.row){
		if(Sort.asc){
			Sort.asc = false;
		}else{
			Sort.row = 'sort';
			Sort.asc = true;
		}
	}else{
		Sort.row = row;
		Sort.asc = true;
	}
	loadPage(refreshCallback);
}

function toggleGroup(groupClass){
	var d = new Date();
	d.setTime(d.getTime() + (365*24*60*60*1000));
	var expires = "expires="+ d.toUTCString();
	$('.'+groupClass).toggle(0);
	GroupHide[groupClass] = !GroupHide[groupClass];
	if(GroupHide[groupClass]){
		$('#gI-'+groupClass).empty().html('<i data-feather="chevron-down" width="20" height="20"></i>');
	}else{
		$('#gI-'+groupClass).empty().html('<i data-feather="chevron-up" width="20" height="20"></i>');
	}
	feather.replace();
	document.cookie = 'GroupHide' + "=" + JSON.stringify(GroupHide) + "; " + expires + "; path=/";
}

function reToggleGroup(){
	$.each(GroupHide, function(groupClass, state){
		if(state){
			$('#gI-'+groupClass).empty().html('<i data-feather="chevron-down" width="20" height="20"></i>');
			$('.'+groupClass).toggle(0);
		}
	})

}

function openInNewTab(url){
	if(!AltPressed){
		if(ShiftPressed){
			ShiftPressed = false;
			changeCursor();
			var win = window.open(url);
			win.focus();
		}else{
			var win = window.open(url, '_blank');
			win.focus();
		}
	}
}

function stopRefresh(){
	clearInterval(RefreshTimer);
	RefreshTimer = false;
}

function refreshCallback(){
	if($("#searchInput").val().trim()){
		var searchstring = $("#searchInput").val().toLowerCase();
    	$("#searchData tr").filter(function() {
			$(this).toggle($(this).text().toLowerCase().indexOf(searchstring) > -1)
		});
    	$('.GroupTitle').hide();
	}
	$("#searchInput").focus();
}

function changeBg(color){
	var bgColour, navColour;
	switch(color){
		case 'red':
			bgColour = '#663333';
			navColour = '#402020';
			break;
		case 'yellow':
			bgColour = '#666633';
			navColour = '#404020';
			break;
		case 'pink':
			bgColour = '#663366';
			navColour = '#402040';
			break;
		case 'green':
			bgColour = '#336633';
			navColour = '#204020';
			break;
		case 'cyan':
			bgColour = '#336666';
			navColour = '#204040';
			break;
		case 'blue':
			bgColour = '#333366';
			navColour = '#202040';
			break;
		default:
			bgColour = '#6c757d';
			navColour = '#343a40';
	}
	$('nav').animate({'background-color': navColour});
	$('body').animate({'background-color': bgColour});
}

function openConfig(){
	if(Sort.row == 'sort' && Sort.asc){
		openConfigFn();
	}else{
		$.post('php/getBookmarks.php', {
			sort: 'sort',
			asc: true

		}, function (ret, status){
			console.log(ret);
			Bookmarks = ret.bookmarks;
			GroupData = ret.groupdata;
			openConfigFn();
			//$('#SI-'+Sort.row).empty();
		});
	}
}

function openConfigFn(){
	var bookmarkDD = '<option value="-1" data-content=\'New Bookmark\'></option>';
	var bMgroupDD = '';
	var bMsortGroupDD;
	var groupDD = '<option value="-1">New Group</option>';
	var iconsDD = '';
	var colorsDD = '';
	var bMuserColNames = '';
	var globalUserColNames = '';
	var groupSortList = '';
	var bMSortList = '';
	$.get('php/getFavicons.php', {}, function (ret, status){
		var icons = ret.icons;
		var favcolors = ret.favcolors;
		$.each(icons, function(j, icon){
			iconsDD += '<option value="'+icon+'" data-content=\'<img heigth="18" class="mr-3" src="img/icons/'+icon+'"></img>'+icon+'\'></option>';
		});
		$.each(favcolors, function(j, color){
			colorsDD += '<option value="'+color+'" data-content=\'<img heigth="18" width="18" class="mr-2" src="img/favcolors/'+color+'"></img>'+color+'\'></option>';
		});
		$('#gcBMFavSelect').empty().append(iconsDD);
		$('#gcFaviconSelect').empty().append(colorsDD);
		$('.selectpicker').selectpicker('refresh');
		$('#gcFaviconSelect').selectpicker('val', Global.favcolor);
		$('#gcBMFavSelectParent').hide();
		$('#gcBMFav').show();
		$('#gcBMFavSelectCheck').change(function() {
			if($(this).prop('checked')){
				$('#gcBMFav').hide();
				$('#gcBMFavSelectParent').show();
				$('.selectpicker').selectpicker('refresh');
			}else{
				$('#gcBMFavSelectParent').hide();
				$('#gcBMFav').show();
			}
		});
	});
	for (gName in Bookmarks){
		bMgroupDD += '<option value="'+gName+'">'+gName+'</option>';
		bMsortGroupDD += '<option value="'+gName+'">'+gName+'</option>';
		groupDD += '<option value="'+gName+'">'+gName+'</option>';
		groupSortList += '<li class="list-group-item list-group-item-action sort-li" data-id="'+GroupData[gName].id+'">'+gName+'<i data-feather="move" class="mt-1 float-right" height="17"></i></li>';
		$.each(Bookmarks[gName], function(i, bookmark){
			bookmarkDD += '<option value="'+bookmark.id+'" data-content=\'<img heigth="18" width="18" class="mr-2 mb-1" src="'+ $('#bm-'+bookmark.id+' .bm-img').attr('src') +'" "></img>'+bookmark.name+' | '+gName+'\'></option>';
		});
	}
	for (var i = 1; i <= Global.userCol; i++) {
		bMuserColNames += '<div class="form-group"><label for="gcUserCol-'+i+'">'+Global['nameU'+i]+'</label><input type="text" id="gcUserCol-'+i+'" placeholder="'+Global['nameU'+i]+'..." class="form-control" /></div>';
		globalUserColNames += '<div class="form-group"><label for="gcUserColLabel-'+i+'">User-Column '+i+' Label</label><input type="text" id="gcUserColLabel-'+i+'" placeholder="your on Label" class="form-control" /><div class="form-check"><input class="form-check-input" type="checkbox" value="" id="gcUserColHide-'+i+'" data-toggle="toggle"><label class="form-check-label" for="gcUserColHide-'+i+'">Hide this Column (Use as Tag Column)</label></div></div>';
	}
	$('#gcBMUserCols').empty().html(bMuserColNames);
	$('#gcUserNames').empty().html(globalUserColNames);
	//BM-Tab
	$('#gcBMSelect').empty().append(bookmarkDD);
	$('#gcBMGroup').empty().append(bMgroupDD);
	$('#gcBMSelect').selectpicker('refresh');
	$('#gcBMName').val('');
	$('#gcBMLink').val('http://');
	$('#gcBMFav').val('http://');
	$('#gcBMRemarks').val('');
	$('#gcBMSelect').off().on('change', function(e){
		var rootId = this.value;
  		if(rootId !== '-1'){
  			for (gName in Bookmarks){
  				$.each(Bookmarks[gName], function(i, bookmark){
  					if(bookmark.id == rootId){
						$('#gcBMFavSelectCheck').prop('checked', false).change();
  						$('#gcBMName').val(bookmark.name);
  						$('#gcBMLink').val(bookmark.link);
  						$('#gcBMFav').val(bookmark.favicon);
  						$('#gcBMRemarks').val(bookmark.remarks);
  						for (var i = 1; i <= Global.userCol; i++) {
  							$('#gcUserCol-'+i).val(bookmark['user'+i]);
  						}
  						$('#gcBMGroup').val(gName);
  						bookmark.group = gName;
						$('#gcSaveBM').off().click(bookmark, saveBM);
						$('#gcDeleteBM').off().click(bookmark, deleteBM).prop('disabled', false);
  						return false;
  					}
  				});
  			}
    	}else{
    		$('#gcBMName').val('');
			$('#gcBMLink').val('http://');
			$('#gcBMFav').val('http://');
			$('#gcBMRemarks').val('');
			$('#gcBMGroup').val('');
			$('#gcSaveBM').off().click({id: '-1'}, saveBM);
			$('#gcDeleteBM').off().prop('disabled', true);
		}
		$('#gcBMSelect').selectpicker('refresh');
    });
    $('#gcSaveBM').off().click({id: '-1'}, saveBM);
    $('#gcDeleteBM').off().prop('disabled', true);
    $('#gcBMForm').removeClass('was-validated');
    $('#gcBM').removeClass("border-bottom-0 border-danger text-danger");
    //Sort Bookmark Tab
    $('#gcSortBMSelect').empty().append(bMsortGroupDD);
    $.each(Bookmarks[$('#gcSortBMSelect').val()], function(i, bookmark){
		bMSortList += '<li class="list-group-item list-group-item-action sort-li" data-id="'+bookmark.id+'"><img style="height: 18px; max-width: 35px;" class="mr-2" src="'+bookmark.favicon+'" onerror="this.onerror=null; this.src=\'img/errorfav.svg\'"></img>'+bookmark.name+'<i data-feather="move" class="mt-1 float-right" height="17"></i></li>';
	});
    $('#gcSortBMList').sortable('destroy').empty().append(bMSortList);
    $('#gcSortBMList').sortable();
    $('#gcBMSortIVF').empty().hide();
    $('#gcSortBMSelect').off().on('change', function(e){
    	var bMSortList = '';
	    $.each(Bookmarks[$('#gcSortBMSelect').val()], function(i, bookmark){
			bMSortList += '<li class="list-group-item list-group-item-action sort-li" data-id="'+bookmark.id+'"><img style="height: 18px; max-width: 35px;" class="mr-2" src="'+bookmark.favicon+'" onerror="this.onerror=null; this.src=\'img/errorfav.svg\'"></img>'+bookmark.name+'<i data-feather="move" class="mt-1 float-right" height="17"></i></li>';
		});
	    $('#gcSortBMList').sortable('destroy').empty().append(bMSortList);
	    $('#gcSortBMList').sortable();
	    feather.replace();
    });
	//Group-Tab
	$('#gcGroupSelect').empty().append(groupDD);
	$('#gcGroupSort').sortable('destroy').empty().append(groupSortList);
	$('#gcGroupName').val('');
	$('#gcGroupRemark').val('');
	$('#gcGroupSort').sortable();
	$('#gcGroupSelect').off().on('change', function(e){
  		if(this.value !== '-1'){
			$('#gcGroupName').val(this.value);
			$('#gcGroupRemark').val(GroupData[this.value].remarks);
    		$('#gcDeleteGroup').off().click(this.value, deleteGroup).prop('disabled', false);
  		} else {
			$('#gcGroupName').val('');
			$('#gcGroupRemark').val('');
    		$('#gcDeleteGroup').off().prop('disabled', true);
    	}
	});
	$('#gcDeleteGroup').off().prop('disabled', true);
    $('#gcGroups').removeClass("border-bottom-0 border-danger text-danger");
	$('#gcGroupName').removeClass('is-invalid');
	$('#gcGroupRemark').removeClass('is-valid');
	$('#gcGroupSelect').removeClass('is-valid');
    $('#gcGroupNameIVF').empty();
    feather.replace();
    //Global-Tab
	$('#gcSiteTitle').val(Global.name);
	$('#gcSiteClaim').val(Global.claim);
	$('#gcRefreshRate').val(parseInt(Global.refresh));
	$('#gcUserCol').val(parseInt(Global.userCol));
	for (var i = 1; i <= Global.userCol; i++) {
		$('#gcUserColLabel-'+i).val(Global['nameU'+i]);
		if(Global['hideU'+i] === '0')	$('#gcUserColHide-'+i).prop("checked", false);
		else							$('#gcUserColHide-'+i).prop("checked", true);
	}
	$('#gcBgSelect').selectpicker('val', Global.background);
	$('#gcBgSelect').off().on('change', function(e){
		changeBg($('#gcBgSelect').val());
		$('#gcBgSelect').selectpicker('refresh');
	});
	$('#gcGlobalForm').removeClass('was-validated');
    $('#gcGlobals').removeClass("border-bottom-0 border-danger text-danger");
	$('#globalConfigModal').modal('show');
}

function saveBM(event){
	var old = event.data;
	var send = true;
	var sort;
	var user = ['', old.user1, old.user2, old.user3, old.user4, old.user5, old.user6, old.user7, old.user8];
	var name = $('#gcBMName').val();
	var link = $('#gcBMLink').val();
	if($('#gcBMFavSelectCheck').prop('checked'))
		var favicon = 'img/icons/'+ $('#gcBMFavSelect').val();
	else
		var favicon = $('#gcBMFav').val();
	$('#gcBMFavSelectCheck').prop('checked', false);
	var remarks = $('#gcBMRemarks').val();
	var group = $('#gcBMGroup').val();
	for (var i = 1; i <= Global.userCol; i++) {
		user[i] = $('#gcUserCol-'+i).val();
	}
	$('#gcBMName')[0].setCustomValidity('');
	$('#gcBMNameIVF').empty();
	$('#gcBMLink')[0].setCustomValidity('');
	$('#gcBMLinkIVF').empty();
	for (gName in Bookmarks){
		$.each(Bookmarks[gName], function(i, bookmark){
			if(gName == group){
				if(name == bookmark.name && name !== old.name){
					$('#gcBMNameIVF').html('Bookmark '+name+' already exists in the same Group '+group+'.<br/> This is not allowed! But in an other Group it would be...');
					$('#gcBMName')[0].setCustomValidity('Bookmark Name '+name+' already exists!');
					$('#gcBMName').change(function() {
						$('#gcBMName')[0].setCustomValidity('');
						$('#gcBMNameIVF').empty();
						$('#gcBMName').off('change');
					});
				}
			}
			if(link == bookmark.link && link !== old.link){
				$('#gcBMLinkIVF').html('Link already exists in Bookmark '+bookmark.name+' in Group '+gName+'!<br/> The same Link is not allowed!');
				$('#gcBMLink')[0].setCustomValidity('Link already exists!');
				$('#gcBMLink').change(function() {
					$('#gcBMLink')[0].setCustomValidity('');
					$('#gcBMLinkIVF').empty();
					$('#gcBMLink').off('change');
				});
			}
		});
	}
    if(!$('#gcBMForm')[0].checkValidity()){
        send = false;
        $('#gcBM').addClass("border-bottom-0 border-danger text-danger");
    }
    $('#gcBMForm').addClass('was-validated');
    if(old.id != '-1'){
    	if(old.name == name && old.link == link && old.favicon == favicon && old.remarks == remarks && old.group == group && old.user1 == user[1] && old.user2 == user[2] && old.user3 == user[3] && old.user4 == user[4] && old.user5 == user[5] && old.user6 == user[6] && old.user7 == user[7] && old.user8 == user[8]){
    		send = false;
    	}
    	sort = old.sort;
    }else{
    	if(!Numbers[group]){
    		sort = 1;
    	}else{
    		sort = Numbers[group] + 1;
    	}
    }
    if(send){
    	if(favicon == '' || favicon == 'http://'){
    		favicon = 'img/icons/bookmark.svg';
    	}
    	$.post('php/saveBookmark.php', {
			id: old.id,
			sort: sort,
			name: name,
			link: link,
			favicon: favicon,
			remarks: remarks,
			group: group,
			user1: user[1],
			user2: user[2],
			user3: user[3],
			user4: user[4],
			user5: user[5],
			user6: user[6],
			user7: user[7],
			user8: user[8]
	
		}, function(data,status){
			console.log("SaveBM Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				stopRefresh();
				if($('#gcBMcloseCheck').prop('checked')){
					loadPage(refreshCallback);
					$('#globalConfigModal').modal('hide');
				}else
					loadPage(openConfig);
			}
		});
    }
}

function saveBMSort(){
	var group = $('#gcSortBMSelect').val();
	var orderChanged = {};
	var order = $('#gcSortBMList').sortable('toArray');
    $.each(Bookmarks[group], function(i, bookmark){
		if(order[i] != bookmark.id){
			orderChanged[order[i]] = i+1;
		}
	});
	if(!$.isEmptyObject(orderChanged)){
    	$.post('php/saveBMsort.php', {
			json: JSON.stringify(orderChanged)

		}, function(data,status){
			console.log("SaveBM-Sort Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				stopRefresh();
				if($('#gcCloseCheckBMSort').prop('checked')){
					loadPage(refreshCallback);
					$('#globalConfigModal').modal('hide');
				}else
					loadPage(openConfig);
			}
		});
    }else{
    	$('#gcBMSortIVF').text('Nothing Changed!').show();
    }
}

function saveGroup(){
	var send = true;
	var sendSort = false;
	var orderChanged = {};
	var oldID = '-1';
	var oldGroup = $('#gcGroupSelect').val();
	var newGroup = $('#gcGroupName').val();
	var newGroupRemark = $('#gcGroupRemark').val();
	var sort = Numbers.groups + 1;
	var order = $('#gcGroupSort').sortable('toArray');
	var i = 0;
	if(oldGroup !== '-1'){
		oldID = GroupData[oldGroup].id;
	}
	for (gName in Bookmarks) {
		if(newGroup === gName && newGroup !== oldGroup){
			$('#gcGroupNameIVF').text('Group-Name alredy exists');
			send = false;
		}
		orderChanged[order[i]] = i+1;
		if(order[i] != GroupData[gName].id){
			sendSort = true;
		}
		i++;
	}
	if(newGroup === '-1'){
		$('#gcGroupNameIVF').text('Group-Name can\'t be "-1"!');
		send = false;
	}else if(newGroup === oldGroup && newGroupRemark === GroupData[oldGroup].remarks){
		$('#gcGroupNameIVF').text('Group-Name not changed');
		send = false;
	}else if(!newGroup.trim()){
		$('#gcGroupNameIVF').text('Group-Name can not be empty');
		send = false;
	}
    if(send || sendSort){
    	if(!send){
    		newGroup = '-1';
    	}
    	$.post('php/saveGroup.php', {
			old: oldID,
			new: newGroup,
			remark: newGroupRemark,
			sort: sort,
			json: JSON.stringify(orderChanged)
	
		}, function(data,status){
			console.log("SaveGroup Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				stopRefresh();
				if($('#gcCloseCheckGroup').prop('checked')){
					loadPage(refreshCallback);
					$('#globalConfigModal').modal('hide');
				}else
					loadPage(openConfig);
			}
		});
    }else{
    	$('#gcGroups').addClass("border-bottom-0 border-danger text-danger");
		$('#gcGroupName').addClass('is-invalid');
		$('#gcGroupRemark').addClass('is-valid');
    	$('#gcGroupSelect').addClass('is-valid');
    }
}

function saveGlobals(){
	var send = true;
	var userLabel = ['', Global['nameU1'], Global['nameU2'], Global['nameU3'], Global['nameU4'], Global['nameU5'], Global['nameU6'], Global['nameU7'], Global['nameU8']];
	var userLabelHide = ['', Global['hideU1'], Global['hideU2'], Global['hideU3'], Global['hideU4'], Global['hideU5'], Global['hideU6'], Global['hideU7'], Global['hideU8']];
	if(!$('#gcGlobalForm')[0].checkValidity()){
        send = false;
        $('#gcGlobals').addClass("border-bottom-0 border-danger text-danger");
    }
    $('#gcGlobalForm').addClass('was-validated');
    for (var i = 1; i <= Global.userCol; i++) {
		userLabel[i] = $('#gcUserColLabel-'+i).val();
		if($('#gcUserColHide-'+i).prop('checked'))	userLabelHide[i] = '1';
		else										userLabelHide[i] = '0';
	}
    if(send){
		var title = $('#gcSiteTitle').val();
		var claim = $('#gcSiteClaim').val();
		var refresh = $('#gcRefreshRate').val();
		var favcolor = $('#gcFaviconSelect').val();
		var background = $('#gcBgSelect').val();
		var userCol = $('#gcUserCol').val();
		Global.background = background;
	    if(favcolor != Global.favcolor){
    		$.post('php/getFavicons.php', {
				color: favcolor
		
			}, function(data,status){
				console.log("SetFavicon Req-Answer Data: "+data+", Status: "+status);
			});
	    }
		$.post('php/saveGlobal.php', {
			title: title,
			claim: claim,
			refresh: refresh,
			favcolor: favcolor,
			background: background,
			userCol: userCol,
			nameU1: userLabel[1],
			nameU2: userLabel[2],
			nameU3: userLabel[3],
			nameU4: userLabel[4],
			nameU5: userLabel[5],
			nameU6: userLabel[6],
			nameU7: userLabel[7],
			nameU8: userLabel[8],
			hideU1: userLabelHide[1],
			hideU2: userLabelHide[2],
			hideU3: userLabelHide[3],
			hideU4: userLabelHide[4],
			hideU5: userLabelHide[5],
			hideU6: userLabelHide[6],
			hideU7: userLabelHide[7],
			hideU8: userLabelHide[8]
	
		}, function(data,status){
			console.log("SaveGlobals Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				stopRefresh();
				if(favcolor != Global.favcolor)
					location.reload();
				loadPage(refreshCallback);
				$('#globalConfigModal').modal('hide');
			}
		});
	}
}

function deleteBM(event){
	var old = event.data;
    if(old.id != '-1'){
    	$.post('php/deleteBookmark.php', {
			id: old.id,
	
		}, function(data,status){
			console.log("DeleteBM Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				stopRefresh();
				if($('#gcBMcloseCheck').prop('checked')){
					loadPage(refreshCallback);
					$('#globalConfigModal').modal('hide');
				}else
					loadPage(openConfig);
			}
		});
    }

}

function deleteGroup(event){
	var name = event.data;
	if(Numbers[name]){
		if(!confirm('The Group '+name+' contains '+Numbers[name]+' Bookmarks!\nAll Bookmarks of '+name+' will be deleted if you delete the Group!\nAre you sure?')){
			return;
		}
	}
    if(name != '-1'){
    	$.post('php/deleteGroup.php', {
			groupname: name,
	
		}, function(data,status){
			console.log("DeleteGroup Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				stopRefresh();
				if($('#gcCloseCheckGroup').prop('checked')){
					loadPage(function(){refreshCallback(); saveGroupSort();});
					$('#globalConfigModal').modal('hide');
				}else
					loadPage(function(){saveGroupSort(); openConfig();});
			}
		});
    }

}

function saveGroupSort(){
	var orderChanged = {};
	var order = $('#gcGroupSort').sortable('toArray');
	var i = 0;
	for (gName in Bookmarks) {
		orderChanged[gName] = i+1;
		i++;
	}
	console.log(JSON.stringify(orderChanged));
	$.post('php/saveGroup.php', {
		old: '-1',
		new: '-1',
		json: JSON.stringify(orderChanged)

	}, function(data,status){
		console.log("SaveGroupSort Req-Answer Data: "+data+", Status: "+status);
	});
}

function getIcons() {
    var links = $('#gcBMLink').val();
    var icons = [];

    for(var i = 0; i < links.length; i++) {
        var link = links[i];

        //Technically it could be null / undefined if someone didn't set it!
        //People do weird things when building pages!
        var rel = link.getAttribute('rel');
        if(rel) {
            //I don't know why people don't use indexOf more often
            //It is faster than regex for simple stuff like this
            //Lowercase comparison for safety
            if(rel.toLowerCase().indexOf('icon') > -1) {
                var href = link.getAttribute('href');

                //Make sure href is not null / undefined            
                if(href) {
                    //Relative
                    //Lowercase comparison in case some idiot decides to put the 
                    //https or http in caps
                    //Also check for absolute url with no protocol
                    if(href.toLowerCase().indexOf('https:') == -1 && href.toLowerCase().indexOf('http:') == -1
                        && href.indexOf('//') != 0) {

                        //This is of course assuming the script is executing in the browser
                        //Node.js is a different story! As I would be using cheerio.js for parsing the html instead of document.
                        //Also you would use the response.headers object for Node.js below.

                        var absoluteHref = window.location.protocol + '//' + window.location.host;

                        if(window.location.port) {
                            absoluteHref += ':' + window.location.port;
                        }

                        //We already have a forward slash
                        //On the front of the href
                        if(href.indexOf('/') == 0) {
                            absoluteHref += href;
                        }
                        //We don't have a forward slash
                        //It is really relative!
                        else {
                            var path = window.location.pathname.split('/');
                            path.pop();
                            var finalPath = path.join('/');

                            absoluteHref += finalPath + '/' + href;
                        }

                        icons.push(absoluteHref);
                    }
                    //Absolute url with no protocol
                    else if(href.indexOf('//') == 0) {
                        var absoluteUrl = window.location.protocol + href;

                        icons.push(absoluteUrl);
                    }
                    //Absolute
                    else {
                        icons.push(href);
                    }
                }
            }
        }
    }

    return icons;
}

function updateDB(){
	console.log('Update of bookmarks DB...');
	$('#bookmarks').empty().html('<h4>Updating bookmark-db...</h4><div class="progress m-4"><div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%"></div></div><div class="text-center"><small class="text-muted text-center">This should not take so long...</small></div>');
	$.post('php/updateDB.php', {
			version: BMP_Version,
			dbVersion: Global.version,
	
		}, function(data,status){
			console.log("UpdateDB Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				loadPage(refreshCallback);
			}else{
				$('#bookmarks').empty().html('<h4>Updating bookmark-db...</h4><p>'+data+'</p>');
			}
		});

}

function getCookie(cname) {
	var name = cname + "=";
	var decodedCookie = decodeURIComponent(document.cookie);
	var ca = decodedCookie.split(';');
	for(var i = 0; i <ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == ' ') {
		  	c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
		  	return c.substring(name.length, c.length);
		}
	}
	return "";
}

function changeCursor(){
	if(Mouseovered){
		if(ShiftPressed)		$("#bookmarks").css({"cursor": "alias"});
		else if(AltPressed)		$("#bookmarks").css({"cursor": "text"});
		else  					$("#bookmarks").css({"cursor": "default"});
	} 	
}

$(document).ready(function () {
	$('#version').append(BMP_Version);
	var cGroupHide = getCookie('GroupHide');
	if(cGroupHide != ''){
		GroupHide = JSON.parse(cGroupHide);
	}
	loadPage(function(){$("#searchInput").focus();});
	$('#configBtn').click(function(){openConfig();});
	$("#searchInput").on("keyup", function() {
    	var searchstring = $.trim($(this).val().toLowerCase());
    	$("#searchData tr").filter(function() {
      		$(this).toggle($(this).text().toLowerCase().indexOf(searchstring) > -1)
    	});
    	if(searchstring){
			if($('#search-addon').is('.feather-search')){
				$('.GroupTitle').hide();
				$('#search-addon1').html('<i data-feather="x" id="search-addon" width="20" height="20"></i>').click(function() {
					$('#searchInput').val('').trigger("keyup");
				});
				feather.replace();
			}
		}else{
    		$('.GroupTitle').show();
			reToggleGroup();
			$('#search-addon1').off().html('<i data-feather="search" id="search-addon" width="20" height="20"></i>');
			feather.replace();
		}
	});
    $("#bookmarks").mouseover(function(e){
		Mouseovered = true;
		changeCursor();
    });
    $("#bookmarks").mouseout(function(){
		Mouseovered = false;
		changeCursor();
    });
    $(document).keydown(function(e){
		if (e.which === 18) 	AltPressed = true;
		if (e.which === 16)		ShiftPressed = true;
		changeCursor();
    });
    $(document).keyup(function(e){
		if (e.which === 18 && AltPressed) 		AltPressed = false;
		if (e.which === 16 && ShiftPressed) 	ShiftPressed = false;
		changeCursor();
	});
	$('#globalConfigModal').on('hidden.bs.modal', function () {
		changeBg(Global.background);
	});
});
