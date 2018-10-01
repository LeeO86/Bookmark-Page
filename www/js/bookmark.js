// Gloal Vars
var Global = {};
var Bookmarks = {};
var RefreshTimer = false;

// Functions
function loadPage(){
	$.get('php/getGlobal.php', {}, function (ret, status){
		console.log(ret.name);
		Global = ret;
		document.title = Global.name;
		$('#page-name').text(Global.name);
		$('#pageClaim').text(Global.claim);
		if(!RefreshTimer)
			RefreshTimer = setInterval(function(){ loadPage() }, (parseInt(Global.refresh)*1000));
	});
	$.get('php/getBookmarks.php', {}, function (ret, status){
		console.log(ret);
		Bookmarks = ret;
		var html = '<div><table class="table table-hover"><thead><th style="width: 50px;"></th><th style="width: 25%;">Name</th><th>Remarks</th></thead><tbody>';
		for (gName in Bookmarks){
			html += '<tr onclick="toggleGroup(\'g-'+gName+'\');"><td></td><th colspan="2" scope="row">'+gName+'</th></tr>';
			$.each(ret[gName], function(i, bookmark){
				html += '<tr id="bm-'+bookmark.id+'" class="g-'+gName+'" onclick="openInNewTab(\''+bookmark.link+'\');"><td><img src="'+bookmark.favicon+'"></img></td><td>'+bookmark.name+'</td><td>'+bookmark.remarks+'</td></tr>';
			});
		}
		html += '</tbody></table></div>';
		$('#bookmarks').empty().html(html);
	});
}

function toggleGroup(groupClass){
	$('.'+groupClass).toggle(0);
}

function openInNewTab(url){
  var win = window.open(url, '_blank');
  win.focus();
}

function stopRefresh(){
	clearInterval(RefreshTimer);
	RefreshTimer = false;
}

function openConfig(){
	var bookmarkDD = '<option value="-1">New Bookmark</option>';
	var bMgroupDD = '';
	var groupDD = '<option value="-1">New Group</option>';
	for (gName in Bookmarks){
		bMgroupDD += '<option value="'+gName+'">'+gName+'</option>';
		groupDD += '<option value="'+gName+'">'+gName+'</option>';
		$.each(Bookmarks[gName], function(i, bookmark){
			bookmarkDD += '<option value="'+bookmark.id+'">'+bookmark.name+' | '+gName+'</option>';
		});
	}
	//BM-Tab
	$('#gcBMSelect').empty().append(bookmarkDD);
	$('#gcBMGroup').empty().append(bMgroupDD);
	$('#gcBMSelect').off().on('change', function(e){
		var rootId = this.value;
  		if(rootId !== '-1'){
  			for (gName in Bookmarks){
  				$.each(Bookmarks[gName], function(i, bookmark){
  					if(bookmark.id == rootId){
  						$('#gcBMName').val(bookmark.name);
  						$('#gcBMLink').val(bookmark.link);
  						$('#gcBMFav').val(bookmark.favicon);
  						$('#gcBMRemarks').val(bookmark.remarks);
  						$('#gcBMGroup').val(gName);
  						bookmark.group = gName;
  						$('#gcSaveBM').off().click(bookmark, saveBM);
  						return false;
  					}
  				});
  			}
    	}else{
    		$('#gcBMName').val('');
			$('#gcBMLink').val('');
			$('#gcBMFav').val('');
			$('#gcBMRemarks').val('');
			$('#gcBMGroup').val('');
			$('#gcSaveBM').off().click({id: '-1'}, saveBM);
		}
    });
    $('#gcSaveBM').off().click({id: '-1'}, saveBM);
    $('#gcBMForm').removeClass('was-validated');
    $('#gcBM').removeClass("border-bottom-0 border-danger text-danger");
	//Group-Tab
	$('#gcGroupSelect').empty().append(groupDD);
	$('#gcGroupSelect').off().on('change', function(e){
  		if(this.value !== '-1')
    		$('#gcGroupName').val(this.value);
    	else
    		$('#gcGroupName').val('');
	});
    $('#gcGroups').removeClass("border-bottom-0 border-danger text-danger");
    $('#gcGroupName').removeClass('is-invalid');
	$('#gcGroupSelect').removeClass('is-valid');
    $('#gcGroupNameIVF').empty();
    //Global-Tab
	$('#gcSiteTitle').val(Global.name);
	$('#gcSiteClaim').val(Global.claim);
	$('#gcRefreshRate').val(parseInt(Global.refresh));
	$('#gcGlobalForm').removeClass('was-validated');
    $('#gcGlobals').removeClass("border-bottom-0 border-danger text-danger");
	$('#globalConfigModal').modal('show');
}

function saveBM(event){
	console.log(event.data);
	var old = event.data;
	var send = true;
	var name = $('#gcBMName').val();
	var link = $('#gcBMLink').val();
	var favicon = $('#gcBMFav').val();
	var remarks = $('#gcBMRemarks').val();
	var group = $('#gcBMGroup').val();
    if(!$('#gcBMForm')[0].checkValidity()){
        send = false;
        $('#gcBM').addClass("border-bottom-0 border-danger text-danger");
    }
    $('#gcBMForm').addClass('was-validated');
    if(old.id != '-1'){
    	if(old.name == name && old.link == link && old.favicon == favicon && old.remarks == remarks && old.group == group){
    		send = false;
    	}
    }
    if(send){
    	$.post('php/saveBookmark.php', {
			id: old.id,
			name: name,
			link: link,
			favicon: favicon,
			remarks: remarks,
			group: group
	
		}, function(data,status){
			console.log("SaveBM Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				loadPage();
				$('#globalConfigModal').modal('hide');
			}
		});
    }

}

function saveGroup(){
	var send = true;
	var oldGroup = $('#gcGroupSelect').val();
	var newGroup = $('#gcGroupName').val();
	if(newGroup === oldGroup){
		$('#gcGroupNameIVF').text('Group-Name not changed');
		send = false;
	}else if(!newGroup.trim()){
		$('#gcGroupNameIVF').text('Group-Name can not be empty');
		send = false;
	}else{
		for (gName in Bookmarks) {
			if(newGroup === gName){
				$('#gcGroupNameIVF').text('Group-Name alredy exists');
				send = false;
			}
		}
	}
    if(send){
    	$.post('php/saveGroup.php', {
			old: oldGroup,
			new: newGroup
	
		}, function(data,status){
			console.log("SaveGroup Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				loadPage();
				$('#globalConfigModal').modal('hide');
			}
		});
    }else{
    	$('#gcGroups').addClass("border-bottom-0 border-danger text-danger");
    	$('#gcGroupName').addClass('is-invalid');
    	$('#gcGroupSelect').addClass('is-valid');
    }
}

function saveGlobals(){
	var send = true;
    if(!$('#gcGlobalForm')[0].checkValidity()){
        send = false;
        $('#gcGlobals').addClass("border-bottom-0 border-danger text-danger");
    }
    $('#gcGlobalForm').addClass('was-validated');
    if(send){
		var title = $('#gcSiteTitle').val();
		var claim = $('#gcSiteClaim').val();
		var refresh = $('#gcRefreshRate').val();
		$.post('php/saveGlobal.php', {
			title: title,
			claim: claim,
			refresh: refresh
	
		}, function(data,status){
			console.log("SaveGlobals Req-Answer Data: "+data+", Status: "+status);
			if(data == 'OK'){
				loadPage();
				$('#globalConfigModal').modal('hide');
			}
		});
	}
}

function getIcons() {
    var links = document.getElementsByTagName('link');
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

$(document).ready(function () {
	loadPage();
	feather.replace();
	$('#configBtn').click(function(){openConfig();});
});