/* Main.js */ 

const bank_icon = chrome.runtime.getURL("images/in_bank.png")
const inv_icon = chrome.runtime.getURL("images/in_inventory.png")
const price_icon = chrome.runtime.getURL("images/price_icon.png");
const drop_icon = chrome.runtime.getURL("images/monster_drop.png")
const collectionchest_icon = chrome.runtime.getURL("images/collectionchest_icon.png")
const inventory_update_icon = chrome.runtime.getURL("images/update_inventory.png")
const tofarm_icon = chrome.runtime.getURL("images/WICF_button.png")

const mergeshop_icon = chrome.runtime.getURL("images/mergeshop_icon.png")
const quest_icon = chrome.runtime.getURL("images/quest_icon.png")
const shop_icon = chrome.runtime.getURL("images/shop_icon.png")
const treasurechest_icon = chrome.runtime.getURL("images/treasurechest_icon.png")
const whellofdoom_icon = chrome.runtime.getURL("images/whellofdoom_icon.png")


var found = 0 
var filterMergeAc = false 


// WIP stuff 
function filterMerge(itm) {
	try {
	var elementList = document.querySelectorAll("tr")
	if (filterMergeAc) {
		filterMergeAc = false 
		itm.innerHTML = "<b style='background-color: red;color:white;border: red;border-'> Hide Non Ac Items </b>"
		
		for (var x = 0; x < elementList.length; x++) {
			
			if (!elementList[x].childNodes[3].innerHTML.includes("Name")){
				if (!elementList[x].childNodes[3].innerHTML.includes('"acsmall.png"')){
					elementList[x].hidden = false 
				}
				
			}
			
		}
		
		
	}
	else {
		filterMergeAc = true 
		itm.innerHTML = "<b style='background-color: red;color:white;border: red;border-'> Show Non Ac Items </b>"
		
		for (var x = 0; x < elementList.length; x++) {
			if (!elementList[x].childNodes[3].innerHTML.includes("Name")){
				if (!elementList[x].childNodes[3].innerHTML.includes('"acsmall.png"')){
					elementList[x].hidden = true 
				}
			
				
			}
		}
	
	}
	} catch(err){alert(err)}
}




// Wait and Process acount data
function waitForTableToLoad(){
		if(typeof document.getElementById("listinvFull").innerHTML.length !== "undefined"){
			if(document.getElementById("listinvFull").innerHTML.length >= 2000){
				processAcount();
			} 
			else {
				setTimeout(waitForTableToLoad, 250);
			}	
		} 
		else {
			setTimeout(waitForTableToLoad, 250);
	}
}

function goto_ToFarm() {
	document.location.href = chrome.runtime.getURL("tofarm.html")
}


function processAcountBackground() {
	var prevurl = document.location.href 
	
	
	chrome.storage.local.set({"background": prevurl}, function() {});
	document.location.href = "https://account.aq.com/AQW/Inventory"
}

function addToFarm_button() {
	const header = document.getElementById("side-bar")
	var ToFarm = document.createElement("button") 
	ToFarm.onclick = function() { goto_ToFarm(); return false; }
	ToFarm.style = "background-color: Transparent;border: none;" 
	ToFarm.innerHTML = " <img style='height:35px;' src="+tofarm_icon+"></img>"
	header.prepend(ToFarm)
	
}

function addUpdateInventory_button() {
	const Title = document.getElementById("page-title")
	var styles = `
    #UpdateInventory:hover {
		filter: contrast(120%) brightness(1.25);; 
	}`
	var styleSheet = document.createElement("style")
	styleSheet.innerText = styles
	document.head.appendChild(styleSheet)
	
	const updateInventory = document.createElement("button") 
	const updateInventoryImg = document.createElement("img");
	updateInventory.onclick = () => processAcountBackground();
	updateInventory.style.backgroundColor = "Transparent";
	updateInventory.style.border = "none";
	updateInventoryImg.id = "UpdateInventory";
	updateInventoryImg.style.height = "35px";
	updateInventoryImg.src = inventory_update_icon;
	
	updateInventory.appendChild(updateInventoryImg);
	Title.appendChild(updateInventory)
	
}
function setFilterAc() {
	chrome.storage.local.get({mergeFilterAc: false}, function(result){
		chrome.storage.local.set({"mergeFilterAc": !result.mergeFilterAc}, function() {});
		document.getElementById("filterAc").checked = !result.mergeFilterAc
	})
}

function processAcount() {
	
	var data = ProcessAccountItems();
	
	// Save Items to local Storage 
	chrome.storage.local.set({"aqwitems": data[0]}, function() {});
	chrome.storage.local.set({"aqwwhere": data[1]}, function() {});
	chrome.storage.local.set({"aqwtype": data[2]}, function() {});
	chrome.storage.local.set({"aqwbuy": data[3]}, function() {});
	chrome.storage.local.set({"aqwcategory": data[4]}, function() {});
	
	chrome.storage.local.get({background: false}, function(result){
		if (result.background !== false && document.location.href == "https://account.aq.com/AQW/Inventory") {
			if (result.background.includes("http://aqwwiki.wikidot.com/")) { // Redirect Only Aqw Wiki Pages  
				document.location.href = result.background
			}
			chrome.storage.local.set({"background": false}, function() {});
		} 
		
	});
	
}




// Account Page Handling 
if (document.URL == "https://account.aq.com/AQW/Inventory") {
	// page load 
	document.addEventListener('DOMContentLoaded', function(event) {
		
	// Wait function for table load 
	waitForTableToLoad()
	
	})
	
	
	
// Wiki Page Handling 
} else {
	// Adds theme if enabled 
	chrome.storage.local.get({darkmode: 0}, function(result){
		if(result.darkmode) {
			addCss(chrome.runtime.getURL("themes/dark.css"));
		}
	});
	
	addCss(chrome.runtime.getURL("themes/progressbar.css"));
	// page load 
	document.addEventListener('DOMContentLoaded', function(event) {
	
	// Removes width bar [Not even usefull]
	var Body = document.getElementsByTagName('body')[0]
	Body.style = Body.style +";overflow-x: hidden;";


	// Get title of Wiki page (Name of category basically) 
	const Title = document.getElementById("page-title")
	const Content = document.getElementById("page-content")
	
	// Creates Found amount element near title. 
	var found_info = document.createElement("a") 
	found_info.innerHTML = "- Found 0 Items"
	found_info.style = "font-weight: bold;color:green;"
	Title.appendChild(found_info)
	
	
	
	
	
	
	addUpdateInventory_button()
	addToFarm_button()
	
	
	// Selects all <a> elements 
	// [It is best method, as it is compatible with other browsers]
	var nodeList = document.querySelectorAll("a")
	
	// How much <a> elements to skip 
	const arrayOffset = 190
	
	let arrayList = Array.from(nodeList).slice(arrayOffset) // About 200 is alright
	
	// Site detect vars 
	
	try{
		var isMonster = document.body.parentElement.innerHTML.includes("/system:page-tags/tag/monster");
	} 
	catch(err){var isMonster = false}
	
	try{
		var isShop =    document.body.parentElement.innerHTML.includes("(Shop)");
	} 
	catch(err){var isShop = false}
	

	// if shop is a merge shop 
	try{
		var isMerge = document.body.innerHTML.includes('/system:page-tags/tag/mergeshop'); 
	} 
	catch(err){var isMerge = false}
	
	// Is Quest Page 
	try{
		var isQuest = document.body.innerHTML.includes('/system:page-tags/tag/quest'); 
	} 
	catch(err){var isQuest = false}
	
	
	
	if (isMerge) {
		var filterAc = document.createElement("p") 
		var filterAcText = document.createElement("strong")
		var filterAcInput = document.createElement("input")
		filterAcInput.id = "filterAc" 
		filterAcInput.type = "checkbox"
		filterAcText.innerHTML = "Merge Shop Filters: "
		filterAc.style = "margin-top:10px;" 

		filterAc.prepend(filterAcInput)
		filterAc.innerHTML = "<br>"+ filterAc.innerHTML + " - Include Only AC Tag items"
		filterAc.prepend(filterAcText)
		Content.prepend(filterAc)
		
		var filterAcInpute = document.getElementById("filterAc")
		
		filterAcInpute.onclick = function(){setFilterAc();return false; }
		
		chrome.storage.local.get({mergeFilterAc: false}, function(result){
			filterAcInpute.checked = result.mergeFilterAc
		})

	}
			
			
	// Item lists 
	try{
		var isList = document.body.parentElement.innerHTML.includes("Go to"); 
	} 
	catch(err){var isList = false}
	
	try{
		var isLocation = document.body.parentElement.innerHTML.includes("/join"); 
	} 
	catch(err){var isLocation = false}
	
	


	
	// get stored data
	// If WIP in options is enabled.
	chrome.storage.local.get({wipmoreinfo: 1}, function(result){WIP_moreinfo = result.wipmoreinfo;})

	// Get account data (Just not items) 
	chrome.storage.local.get({aqwbuy: []}, function(result){Buy = result.aqwbuy;});
	chrome.storage.local.get({aqwcategory: []}, function(result){Category = result.aqwcategory;});
	chrome.storage.local.get({aqwwhere: []}, function(result){Where = result.aqwwhere;});
	chrome.storage.local.get({aqwtype: []}, function(result){Type = result.aqwtype;});
	
	
	
	
	
	
	// Get items and process it 
	chrome.storage.local.get({aqwitems: []}, function(result){
			var Items = result.aqwitems;
			
			if (isMerge) {
				DisplayCostMergeShop(Items)
			}
	
			
			// Iterate over nodelist with array offset applied 
			for (var x = 0; x < arrayList.length; x++) {
				
				ProcessWikiItem(nodeList, arrayOffset, Items, Buy, Category, Where, Type, x, isMerge, isList, isQuest, isMonster) 
				
				
				// Wip process (Can be enabled in options of Extension.
				if (WIP_moreinfo) {
			
					ProcessAnyWikiItem(nodeList, arrayOffset, Buy, Category, Where, Type, x, isMonster, isQuest, isMerge)
					
				}
			
			
			}
			
			
			// Displays found amount 
			found_info.innerHTML = "- Found "+found+" Items" // Displays items found 
			
	})
	
	})
}
