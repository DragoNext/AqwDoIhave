

var Items = [];
var isChromium = window.chrome;


if (document.URL == "https://account.aq.com/AQW/Inventory") {
	
	window.addEventListener('load', function () {
	  setTimeout(() => {  console.log("World!"); 
  
		var matchingItems = [];
		var allElements = document.getElementsByTagName("*");
		var inventoryElement = document.getElementsByTagName("td");
		var l = 0 
		for (x in inventoryElement) {
			var l = l + 1 
			if (l == 1) {
				matchingItems.push(inventoryElement[x]);
			}
			else {
				if (l == 6) {
					var l = 0 
				}
			}
		}
		
		matchingItems.forEach(function (item, index) {
		  Items.push(item.innerHTML);
		});
		
		chrome.storage.sync.set({ "aqwitems": Items }, function(){
		});
		chrome.storage.local.set({"aqwitems": Items}, function() {
		});
		alert(Items);
	  }, 5000);

	})
}
else {
	function findNodeByInnerHTML(nodelist, innerHTML){
    for(let ii = 0; ii < nodelist.length; ii++){
        if(nodelist[ii].innerHTML === innerHTML)
            return nodelist[ii]
		}
	}
	window.addEventListener('load', function () {
	  setTimeout(() => {  console.log("Hi!"); 
		chrome.storage.local.get({aqwitems: []}, function(result){
				Items = result.aqwitems;
	
				// Preety if nesting <3 
				for (k in Items) {
					let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k])
					if (span != undefined) {
						span.style ="font-weight: bold;color:green;";
					}
					else {
						let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (0 AC)")
						if (span != undefined) {
							span.style ="font-weight: bold;color:green;";
						}
						else {
							let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Merge)")
							if (span != undefined) {
								span.style ="font-weight: bold;color:green;";
							}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Non-AC)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Class)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Class) (AC)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (AC)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Class) (Merge)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Quest)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Non-Legend)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							else {
								let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k]+" (Legend)")
								if (span != undefined) {
									span.style ="font-weight: bold;color:green;";
								}
							
							
						}
							
						}
							
						}	
							
						}	
						}	
							
						}	
							
						}	
							
						}	
							
						}	
					}
				}
				
				
			});
			
		
			
	}, 0);});
	
	
	
	
		
		
	


		

	
}