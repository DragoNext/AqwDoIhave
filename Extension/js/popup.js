document.addEventListener('DOMContentLoaded', restore_options);

function restore_options() {
	var docs = document.getElementById('dark_moded')
	chrome.storage.local.get({darkmode: 0}, function(result){
	if (result.darkmode == 1) {
		docs.innerHTML = "Dark Mode (ON)"
	}
	else{
		docs.innerHTML = "Dark Mode (OFF)"
	}

 
 })
 }
 
function save_options() {
  var Dark_Mode = 0
  if (document.getElementById('dark_moded').innerHTML == "Dark Mode (ON)") {
	  Dark_Mode = 0
  } else {
	  Dark_Mode = 1
  }
  chrome.storage.local.set({"darkmode": Dark_Mode}, function() {});
  restore_options()
  }
 
 
 document.getElementById('dark_moded').addEventListener('click',
    save_options);