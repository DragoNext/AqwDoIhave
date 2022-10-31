

var Items = [];
var Where = [];
var Type = []; 
var Buy = []; 
var Category = []; 

var isChromium = window.chrome;


if (document.URL == "https://account.aq.com/AQW/Inventory") {
	// Add some visual to show that extension is trying to read inventory
	
	
	//
	
	
	// *Change this timeout approach to:
	// Detect when table is loaded [ table id="listinvFull" ]
	waitForElement()
	
	function inv_init(){
		var indicator = document.createElement("div")
		indicator.innerHTML = "<h>Loaded 0 Items</h>"
		indicator.style = "display: block;width: auto;text-align: right;position:relative;"
		indicator.classList.add("tblHeader")
		
		document.getElementById("listinvFull_filter").appendChild(indicator)
		
		var inventoryElement = document.getElementsByTagName("td");
		var l = 0 
		for (var x = 0; x < inventoryElement.length; x++) {
			l = l + 1 
			if (l == 1) {
				Items.push(inventoryElement[x].innerHTML);
			} else if (l == 2) {
				Type.push(inventoryElement[x].innerHTML);
			} else if (l == 3) {
				Where.push(inventoryElement[x].innerHTML);
			} else if (l == 4) {
				Buy.push(inventoryElement[x].innerHTML);
			} else if (l == 5) {
				Category.push(inventoryElement[x].innerHTML);
			} else {
				if (l == 6) {
					l = 0 
				}
			}
		}
		indicator.innerHTML = "<h>Loaded "+Items.length+" Items</h>"
		
		chrome.storage.sync.set({ "aqwitems": Items }, function(){});
		chrome.storage.local.set({"aqwitems": Items}, function() {});
		
	  };


	function waitForElement(){
		if(typeof document.getElementById("listinvFull").innerHTML.length !== "undefined"){
			//variable exists, do what you want
			if(document.getElementById("listinvFull").innerHTML.length >= 2000){
				inv_init();	
			}
			else {
				setTimeout(waitForElement, 250);
			}	
		}
		else{
			setTimeout(waitForElement, 250);
		}
	}
	
	

} else {
	// Add some visual to represent that extension is working 
	
	
	//
	
	
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
				// Change nesting to just replacing tags in > ( ) to nothing and then comparing 
				// or 
				// retrive more information from account, [Category, Buy, Type] still wouldn't be able to diffrenaite (FREE) (AC) with (MERGE) (AC) :/ shucks
				for (k in Items) {
					let span = findNodeByInnerHTML(document.querySelectorAll('a'), Items[k])
					if (span != undefined) {
						
						
						// Add customization in extension setting 
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