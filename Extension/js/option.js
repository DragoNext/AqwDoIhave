// Saves options to chrome.storage

//<div class="block">
//<a style="vertical-align:middle">Highlight color</a>
//<input type="text" id="like3">
//</div>


// Download file for exporiting json data  
function download(content, fileName, contentType) {
    var a = document.createElement("a");
    var file = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}


function export_account() {
	var ExportData = {} 
	chrome.storage.local.get({aqwitems: [null]}, function(result){var Items = result.aqwitems;
		chrome.storage.local.get({aqwbuy: [null]}, function(result){var Buy = result.aqwbuy;
			chrome.storage.local.get({aqwcategory: [null]}, function(result){var Category = result.aqwcategory;
				chrome.storage.local.get({aqwwhere: [null]}, function(result){var Where = result.aqwwhere;
					chrome.storage.local.get({aqwtype: [null]}, function(result){var Type = result.aqwtype;
						
						for (var i = 0; i < Items.length; i++) {
							ExportData[Items[i]] = [Buy[i], Category[i], Where[i], Type[i]]
						}
						
						
						var data = JSON.stringify(ExportData);
						download(data, "AccountData.json", 'text/plain');
					
		
		
					});	
				});
			});
		});
	});
	
	

	
	
}


function save_options() {
  var Dark_Mode = document.getElementById('dark_mode').checked;
  chrome.storage.local.set({"darkmode": Dark_Mode}, function() {});
  var WIP_moreinfo = document.getElementById('like').checked;
  chrome.storage.local.set({"wipmoreinfo": WIP_moreinfo}, function() {});	
}

function restore_options() {
  chrome.storage.local.get({wipmoreinfo: 1}, function(result){
	document.getElementById('like').checked = result.wipmoreinfo 
   })

   chrome.storage.local.get({darkmode: 0}, function(result){
	document.getElementById('dark_mode').checked = result.darkmode
   })
		

}

document.addEventListener('DOMContentLoaded', restore_options);

document.getElementById('save').addEventListener('click',
    save_options);
	
document.getElementById('export').addEventListener('click',
    export_account);