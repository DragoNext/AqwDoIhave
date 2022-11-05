// Saves options to chrome.storage

//<div class="block">
//<a style="vertical-align:middle">Highlight color</a>
//<input type="text" id="like3">
//</div>


function save_options() {
  var WIP_price = document.getElementById('like').checked;
  chrome.storage.local.set({"wipprice": WIP_price}, function() {});

  var Dark_Mode = document.getElementById('dark_mode').checked;
  chrome.storage.local.set({"darkmode": Dark_Mode}, function() {});
			
}

function restore_options() {
  chrome.storage.local.get({wipprice: 0}, function(result){
		document.getElementById('like').checked = result.wipprice
		chrome.storage.local.get({darkmode: 0}, function(result){
			document.getElementById('dark_mode').checked = result.darkmode
		})
		
  })
}

document.addEventListener('DOMContentLoaded', restore_options);

document.getElementById('save').addEventListener('click',
    save_options);