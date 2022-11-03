// Saves options to chrome.storage

//<div class="block">
//<a style="vertical-align:middle">Highlight color</a>
//<input type="text" id="like3">
//</div>


function save_options() {
  var WIP_price = document.getElementById('like').checked;
  chrome.storage.local.set({"wipprice": WIP_price}, function() {});
		
}

function restore_options() {
  chrome.storage.local.get({wipprice: 0}, function(result){
		document.getElementById('like').checked = result.wipprice
  })
}

document.addEventListener('DOMContentLoaded', restore_options);

document.getElementById('save').addEventListener('click',
    save_options);