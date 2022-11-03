// ProcessAccountItems.js

// Will move that later .-. to file 
const _UndArray_0 = ["Unidentified 1","Unidentified 2","Unidentified 3","Unidentified 4","Unidentified 5","Unidentified 6","Unidentified 7","Unidentified 8","Unidentified 9","Unidentified 12","Unidentified 14","Unidentified 15","Unidentified 16","Unidentified 17","Unidentified 18","Unidentified 19","Unidentified 13","Unidentified 20","Unidentified 21","Unidentified 24","Unidentified 26","Unidentified 28","Unidentified 29","Unidentified 30","Unidentified 31","Unidentified 32","Unidentified 33"]
const _UndArray_1 = ["Trig Buster","Sharkbait's True Head","Dragon Bone Hammer","Small Hammer","Rounded Stone Hammer",
"Parasitic Hacker","Star Dagger","Bee Sting Dagger", "Ordinary Iron Wing Helm","Bone Walking Cane","Worn Axe","Dark Cyclops Face","Emblem Mace","Iron Plate Hammer","Duck on a Stick","Koi Fish in a Sphere","The Contract of Nulgath","Dragonbone Blade","Dragonbone Axe","Essence of the Void Fiend","Ordinary Cape","Spinal Tap","Mysterious Walking Cane","Platinum Twin Blade","Platinum Battle Shank","Cruel Dagger Of Nulgath","Primal Dagger Tooth"
]
//

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
