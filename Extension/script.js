

var Items = [];
var Where = [];
var Type = []; 
var Buy = []; 
var Category = []; 

var isChromium = window.chrome;

const bank_icon = "https://i.imgur.com/3jDQEc0.png"
const inv_icon = "https://i.imgur.com/dicssH5.png"


if (document.URL == "https://account.aq.com/AQW/Inventory") {
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
			let iterated = inventoryElement[x].innerHTML
			if (l == 1) {
				Items.push(iterated);
			} else if (l == 2) {
				Type.push(iterated);
			} else if (l == 3) {
				Where.push(iterated);
			} else if (l == 4) {
				Buy.push(iterated);
			} else if (l == 5) {
				
				if (Category == "Item" || Category == "Resource" || Category == "Quest Item") {
					let itemname = Items.pop(); 
					if (itemname.includes(" x")) {
						Category.push([iterated,itemname.split(" x")[1]]); // Correct amount of items 
						Items.push(itemname.split(" x")[0]); // Correct rescource name 
					
					}
					else {
						Category.push([iterated, 1]); // Only 1 item avaliable
						Items.push(itemname);
					}
				
				}
				else {
					Category.push(inventoryElement[x].innerHTML);
				}
				
			} else {
				if (l == 6) {
					l = 0 
				}
			}
		}
		indicator.innerHTML = "<h>Loaded "+Items.length+" Items</h>"
		
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
	let Title = document.getElementById("page-title")
	var found_info = document.createElement("a") 
	found_info.innerHTML = "- Found 0 Items"
	found_info.style = "font-weight: bold;color:green;"
	Title.appendChild(found_info)
	
	var nodeList = document.querySelectorAll("a")
	const arrayOffset = 200 
	let arrayList = Array.from(nodeList).slice(arrayOffset) // About 200 is alright
	
	var found = 0 

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
				let nodeText = nodeList[arrayOffset+x].innerHTML.split("(")[0] // Removes any (Legend) (Non Ac) Etc if you have one you have one 
				let nodeLink = nodeList[arrayOffset+x].href
				let isRep = nodeLink.includes("-faction") // Skip Ranks in merge shop from checking 
				isRep = !isRep
				if (isRep) { 
					if (Items.includes(nodeText)) {
						nodeList[arrayOffset+x].style = "font-weight: bold;color:green;"
						if (Where[Items.indexOf(nodeText)] == "Bank") {
							nodeList[arrayOffset+x].innerHTML = nodeList[arrayOffset+x].innerHTML  + "</a> <img title='In Bank' style='height:20px' src='"+bank_icon+"'></img>"
						}
						else {
							nodeList[arrayOffset+x].innerHTML = nodeList[arrayOffset+x].innerHTML  + "</a> <img title='In inventory' style='height:20px' src='"+inv_icon+"'></img>"
						}
						found += 1 
						
					}
				}
			}
			found_info.innerHTML = "- Found "+found+" Items"
			});

}