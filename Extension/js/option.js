// Saves options to chrome.storage

//<div class="block">
//<a style="vertical-align:middle">Highlight color</a>
//<input type="text" id="like3">
//</div>


function save_options() {
  var Dark_Mode = document.getElementById('dark_mode').checked;
  chrome.storage.local.set({"darkmode": Dark_Mode}, function() {});
  var WIP_moreinfo = document.getElementById('like').checked;
  chrome.storage.local.set({"wipmoreinfo": WIP_moreinfo}, function() {});	
}

function restore_options() {
  chrome.storage.local.get({wipmoreinfo: 0}, function(result){
	document.getElementById('like').checked = result.wipmoreinfo 
   })

   chrome.storage.local.get({darkmode: 0}, function(result){
	document.getElementById('dark_mode').checked = result.darkmode
   })
		

}

document.addEventListener('DOMContentLoaded', restore_options);

document.getElementById('save').addEventListener('click',
    save_options);