// ProcessAccountItems.js


function getJson(theUrl)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, false ); 
	xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText)
}

var json_data = getJson(chrome.runtime.getURL("data/Unidentified_Translation.json"))



var _UndArray_0 = json_data["Names"]
var _UndArray_1 = json_data["Translation"]
  



// Translates unidentified items 
function translateUnidentified(itemname) {
	if (itemname.includes("Unidentified")) {
		for (var x = 0; x < _UndArray_0.length; x++) {
			if (itemname == _UndArray_0[x]) {
				return _UndArray_1[x];
			}
		}
	}
	return itemname;
}

	
// Processes items from account 
function ProcessAccountItems() {
		// Stored data for return to main 
		var Items = []
		var Where = []
		var Type = []
		var Buy = []
		var Category = [] 
		
		// Indicator of loaded items bellow search input.
		var indicator = document.createElement("div");
		
		indicator.innerHTML = "<h>Loaded 0 Items</h>";
		indicator.style = "display: block;width: auto;text-align: right;position:relative;";
		indicator.classList.add("tblHeader");
		document.getElementById("listinvFull_filter").appendChild(indicator);
		
		// Get all table elements 
		var inventoryElement = document.getElementsByTagName("td");
		
		// Counter for recgonizing row of table 
		var count = 0;
		
		// Loop Througth Table Elements 
		for (var x = 0; x < inventoryElement.length; x++) {
			count += 1;
			
			// Current Table Element 
			let iterated = inventoryElement[x].innerHTML.trim().replace("’","'");
			
			//  Count 1 == Item Name 
			if (count == 1) {
				if (iterated.includes(" x")) { // Checks if item has count (Just for Unidentified Translation)
					Items.push(iterated);
				} else {
					Items.push(translateUnidentified(iterated));
				}
			} 
			
			// Count 2 == Type 
			else if (count == 2) {
				
				// Checks type of item if its one of stackable.
				if (iterated == "Item" || iterated == "Resource" || iterated == "Quest Item" || iterated == "Wall Item" || iterated == "Floor Item") {
					
					// Gets item name 
					let itemname = Items.pop(); 
					
					// If it has xAmount it will process the amount 
					if (itemname.includes(" x")) {
						
						// Saves Type as [Type, ItemAmount] 
						Type.push([iterated,itemname.split(" x")[1]]); 
						
						// Return name without xAmount
						Items.push(translateUnidentified(itemname.split(" x")[0])); 
					}
					// If it has no amount give it 1 as amount
					else {
						Type.push([iterated, 1]);
						Items.push(translateUnidentified(itemname));
					}
				} else {
					// Normall process of types just push value.
					let psh = inventoryElement[x].innerHTML.trim();
					Type.push(psh);
				}	
			} 
			
			// Count 3 == Where (Location of item)
			else if (count == 3) {
				Where.push(iterated);
			} 
			
			// Count 4 == Buy  (Ac/Gold)
			else if (count == 4) {
				Buy.push(iterated);
			} 
			
			// Count 5 == Category (Free / Member) 
			else if (count == 5) {
				let psh = inventoryElement[x].innerHTML.trim();
				Category.push(psh);
			}	
			else {
				// Reset Counter 
				if (count == 6) {
					count = 0;
				}
			}	
		}
	indicator.innerHTML = "<h>Loaded "+Items.length+" Items</h>"
	
	var data = [Items, Where, Type, Buy, Category]
	return data;
}
