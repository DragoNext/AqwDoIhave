

var Items = [];
var test = 2;
if (document.URL == "https://account.aq.com/AQW/Inventory") {
	
	window.addEventListener('load', function () {
	  setTimeout(() => {  console.log("World!"); 
		var className = "sorting_1"
		var matchingItems = [];
		var allElements = document.getElementsByTagName("*");

		for(var i=0; i < allElements.length; i++)
		{
			if(allElements [i].className == className)
			{
				matchingItems.push(allElements[i]);
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