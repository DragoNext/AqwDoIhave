

var Items = [];
var Where = [];
var Type = []; 
var Buy = []; 
var Category = []; 

var isChromium = window.chrome;
const _UndArray_0 = ["Unidentified 1","Unidentified 2","Unidentified 3","Unidentified 4","Unidentified 5","Unidentified 6","Unidentified 7","Unidentified 8","Unidentified 9","Unidentified 12","Unidentified 14","Unidentified 15","Unidentified 16","Unidentified 17","Unidentified 18","Unidentified 19","Unidentified 13","Unidentified 20","Unidentified 21","Unidentified 24","Unidentified 26","Unidentified 28","Unidentified 29","Unidentified 30","Unidentified 31","Unidentified 32","Unidentified 33"]
const _UndArray_1 = ["Trig Buster","Sharkbait's True Head","Dragon Bone Hammer","Small Hammer","Rounded Stone Hammer",
"Parasitic Hacker","Star Dagger","Bee Sting Dagger", "Ordinary Iron Wing Helm","Bone Walking Cane","Worn Axe","Dark Cyclops Face","Emblem Mace","Iron Plate Hammer","Duck on a Stick","Koi Fish in a Sphere","The Contract of Nulgath","Dragonbone Blade","Dragonbone Axe","Essence of the Void Fiend","Ordinary Cape","Spinal Tap","Mysterious Walking Cane","Platinum Twin Blade","Platinum Battle Shank","Cruel Dagger Of Nulgath","Primal Dagger Tooth"
]


const bank_icon = "https://i.imgur.com/3jDQEc0.png"
const inv_icon = "https://i.imgur.com/dicssH5.png"
const price_icon = "https://i.imgur.com/nVHL0Rz.png"

function translateUnidentified(itemname) {
	if (itemname.includes("Unidentified")) {
		for (var x = 0; x < _UndArray_0.length; x++) {
			if (itemname == _UndArray_0[x]) {
				return _UndArray_1[x]  
			}
		}
	}
	return itemname 
} 


function httpGet(theUrl, nodeList, arrayOffset, x)
{
	function checkData() {
			if (xmlHttp.readyState == 4) {
				if (xmlHttp.responseText.includes("Sellback:")) {
					sellback_price = xmlHttp.responseText.split("Sellback:")[1].split("strong>")[1].split("<br")[0]
					if (sellback_price !== undefined) { 
						nodeList[arrayOffset+x].innerHTML = nodeList[arrayOffset+x].innerHTML  + "</a> <img title='"+sellback_price+"' style='width:32px' src='"+price_icon+"'></img>"
					}
				}
				
			}  
		}
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, true ); // false for synchronous request
	xmlHttp.onreadystatechange = checkData;
	xmlHttp.send( null );
    return true
}





async function item_from(nodeList, arrayOffset, Buy, Category, Where, Type, x) { 
	
	let nodeText = nodeList[arrayOffset+x].innerHTML // No need for highlight 
	
	let nodeLink = nodeList[arrayOffset+x].href
	
	
	isHashtag = !nodeLink.includes("#")
	isSorting = !nodeLink.includes("sort-by-")
	
	
	if (isHashtag && isSorting) {
		if (nodeLink.includes("http://aqwwiki.wikidot.com/")){
			httpGet(nodeLink, nodeList, arrayOffset, x);
		}
	}
	
}

async function tag_item(nodeList, arrayOffset, Buy, Category, Where, Type, x) {
	// getting text of item + removing not needed text (dosen't compare to inv) 
	let nodeText = nodeList[arrayOffset+x].innerHTML.replace(" (0 AC)","").replace(" (AC)","").replace(" (Armor)","").replace(" (Legend)","").replace(" (temp)","").replace(" (Temp)","").replace(" (Special)","").replace(" (Misc)","").trim()
	
	// New Needed_Amount / Amount_you_have elements 
	let node_1 = document.createElement("a");
	let node_2 = document.createElement("a");
	
	// link of item /item-name 
	let nodeLink = nodeList[arrayOffset+x].href

	
	// is rep if the link is just a link to /X-faction 
	let isRep = !nodeLink.includes("-faction") // Skip Ranks in merge shop from checking 
	
	// if shop is a merge shop 
	let isMerge = document.URL.includes("merge")


	if (isRep) { 
		if (Items.includes(nodeText)) {
			nodeList[arrayOffset+x].style = "font-weight: bold;color:green;"
			
			if (Type[Items.indexOf(nodeText)].length == 2) {
				// gets amount from inventory 
				let amount = parseInt(Type[Items.indexOf(nodeText)][1] )
				
				// Geting location of item drop count or location next to item found
				if ( isMerge ) { 
					var count_node = nodeList[arrayOffset+x].nextSibling
				} else {
					var count_node = nodeList[arrayOffset+x].parentNode.lastChild
				}
				if (count_node.data == undefined ) {
					var count_node = nodeList[arrayOffset+x].nextSibling
				}
				
				// detection for monster drop that has range 
				if (count_node.data.includes("-")) {
					var needed_amount = count_node.data.slice(2).replace(" ","");
				} else {
					var needed_amount = parseInt(count_node.data.slice(2).replace(",",""));
				}
				
				// formating original amount / needed amount to final result.
				if (isNaN(needed_amount)) {
					var needed_amount=1;
				};
				node_1.innerHTML = String(" x"+needed_amount+"/")	
		
				
			
				// Stylizer for amount of items
				node_2.innerHTML = String(amount)
				if (needed_amount <= amount) {
					node_1.style = "color:black;"
					node_2.style = "font-weight: bold;color:green;"
				}
				else {
					node_1.style = "color:black;"
					node_2.style = "font-weight: bold;color:red;"
				}
				
				if (isMerge) {
					// Dosen't require adding new element (Just replace , with / )
					count_node.data = count_node.data.replace(",","")+"/"
					// Ads new element 
					nodeList[arrayOffset+x].parentNode.insertBefore(node_2, nodeList[arrayOffset+x].nextSibling.nextSibling)
					
				}
				else {
					// erases previous data 
					count_node.data = ""
					
					// Adds new element 
					nodeList[arrayOffset+x].parentNode.appendChild(node_1) 
					nodeList[arrayOffset+x].parentNode.appendChild(node_2) 
				
				}
			}
			
			// Adds icons of where is located 
			if (Where[Items.indexOf(nodeText)] == "Bank") {
				nodeList[arrayOffset+x].innerHTML = nodeList[arrayOffset+x].innerHTML  + "</a> <img title='In Bank' style='height:20px' src='"+bank_icon+"'></img>"
			}
			else {
				nodeList[arrayOffset+x].innerHTML = nodeList[arrayOffset+x].innerHTML  + "</a> <img title='In inventory' style='height:20px' src='"+inv_icon+"'></img>"
			}
			found += 1 //Count items found 
		}
	}
};




if (document.URL == "https://account.aq.com/AQW/Inventory") {
	waitForElement()
	// Basically parsing inventory.. (Finished)
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
			
			let iterated = inventoryElement[x].innerHTML.trim().replace("’","'");;
			if (l == 1) {
				if (iterated.includes(" x")) {
					Items.push(iterated);
				} else {
					Items.push(translateUnidentified(iterated));
				}
			} else if (l == 2) {
				if (iterated == "Item" || iterated == "Resource" || iterated == "Quest Item" || iterated == "Wall Item" || iterated == "Floor Item") {
					let itemname = Items.pop(); 
					if (itemname.includes(" x")) {
						Type.push([iterated,itemname.split(" x")[1]]); // Correct amount of items 
						Items.push(translateUnidentified(itemname.split(" x")[0])); // Correct rescource name 
					}
					else {
						Type.push([iterated, 1]); // Only 1 item avaliable
						Items.push(translateUnidentified(itemname));
					}
				} else {
					let psh = inventoryElement[x].innerHTML.trim();
					Type.push(psh);
				}	
			} else if (l == 3) {
				Where.push(iterated);
			} else if (l == 4) {
				Buy.push(iterated);
				
			} else if (l == 5) {
				let psh = inventoryElement[x].innerHTML.trim();
				Category.push(psh);
				
			}	else {
				if (l == 6) {
					l = 0 
				}
			}
			
		}
		indicator.innerHTML = "<h>Loaded "+Items.length+" Items</h>"
		
		// save data
		chrome.storage.local.set({"aqwitems": Items}, function() {});
		chrome.storage.local.set({"aqwwhere": Where}, function() {});
		chrome.storage.local.set({"aqwtype": Type}, function() {});
		chrome.storage.local.set({"aqwbuy": Buy}, function() {});
		chrome.storage.local.set({"aqwcategory": Category}, function() {});
		
	  };
	function waitForElement(){
		if(typeof document.getElementById("listinvFull").innerHTML.length !== "undefined"){
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
	var Title = document.getElementById("page-title")
	var found_info = document.createElement("a") 
	found_info.innerHTML = "- Found 0 Items"
	found_info.style = "font-weight: bold;color:green;"
	Title.appendChild(found_info)
	
	var nodeList = document.querySelectorAll("a")
	const arrayOffset = 200 
	let arrayList = Array.from(nodeList).slice(arrayOffset) // About 200 is alright
	var found = 0 

	// get stored data 
	chrome.storage.local.get({wipprice: 0}, function(result){
		WIP_price = result.wipprice;
	})
	
	chrome.storage.local.get({aqwbuy: []}, function(result){
		Buy = result.aqwbuy;
	});
	chrome.storage.local.get({aqwcategory: []}, function(result){
		Category = result.aqwcategory;
	});
	chrome.storage.local.get({aqwwhere: []}, function(result){
		Where = result.aqwwhere;
	});
	chrome.storage.local.get({aqwtype: []}, function(result){
		Type = result.aqwtype;
	});
	
	
	
	chrome.storage.local.get({aqwitems: []}, function(result){
			Items = result.aqwitems;
			if (Items.includes(Title.innerHTML.split('\n')[1])) {
				
				Title.style = "font-weight: bold;color:green;"
				
			};
			
			
			for (var x = 0; x < arrayList.length; x++) {
				tag_item(nodeList, arrayOffset, Buy, Category, Where, Type, x) 
				if (WIP_price) {
					item_from(nodeList, arrayOffset, Buy, Category, Where, Type, x)
				}
			}
			found_info.innerHTML = "- Found "+found+" Items" // Displays items found 
			});

}