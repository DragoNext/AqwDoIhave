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
const normal_icon = chrome.runtime.getURL("images/normal_icon.png")

const wiki_searchpage = "aqwwiki.wikidot.com/search-items"
var found = 0 
var filterMergeAc = false 


// WIP stuff 
function resetFilterMerge() {
	var elementList = document.querySelectorAll("tr")
	
	for (var x = 0; x < elementList.length; x++) { 
		if (elementList[x].querySelectorAll("td").length == 3) { 
			elementList[x].hidden = false  
		}
	}
}


function TagFilterMerge(normal,ac,legend) {
	var hideNormal = !normal 
	var hideAc = !ac 
	var hideLegend = !legend 
	
	var elementList = document.querySelectorAll("tr")
	
	for (var x = 0; x < elementList.length; x++) { 
		if (elementList[x].querySelectorAll("td").length == 3) {
			
			checkAc = elementList[x].innerHTML.includes("acsmall.png")
			checkLegend = elementList[x].innerHTML.includes("legendsmall.png")
			checkNormal = !checkAc & !checkLegend
			
			//alert(checkAc+"  "+checkLegend+"  "+checkNormal+"\n"+hideAc+"  "+hideLegend+"  "+hideNormal+"\n")
			

			if (hideLegend == false & hideAc == false & hideNormal == true) {
				if (checkNormal == true) {
					elementList[x].hidden = true 
				} 
				if (checkAc == true & checkLegend == false) {
					elementList[x].hidden = true 
				} 
				if (checkAc == false & checkLegend == true) {
					elementList[x].hidden = true 
				} 
				
			} else if (hideLegend == false & hideAc == true & hideNormal == true) {
				if (checkLegend == false) {
					elementList[x].hidden = true 
				}
			} else if (hideLegend == true & hideAc == true & hideNormal == true) {

			} else if (hideLegend == true & hideAc == false & hideNormal == true) {
				if (!checkAc == true) {
					elementList[x].hidden = true 
				}
			} else if (hideLegend == false & hideAc == true & hideNormal == false) {
				if (checkAc == true | checkNormal == true) {
					elementList[x].hidden = true 
				}
			} else if (hideLegend == true & hideAc == false & hideNormal == false) {
				if (!checkAc == true | checkLegend == true) {
					elementList[x].hidden = true 
				}
				
			} else if (hideLegend == true & hideAc == true & hideNormal == false) {
				if (checkAc == true | checkLegend == true) {
					elementList[x].hidden = true 
				}
				
			} 
			
			
		}
	}
	
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
		document.getElementById("AcFilter").checked = !result.mergeFilterAc
	})
	FilterEvent()
}

function setFilterNormal() {
	chrome.storage.local.get({mergeFilterNormal: false}, function(result){
		chrome.storage.local.set({"mergeFilterNormal": !result.mergeFilterNormal}, function() {});
		document.getElementById("NormalFilter").checked = !result.mergeFilterNormal
	})
	FilterEvent()
}

function setFilterLegend() {
	chrome.storage.local.get({mergeFilterLegend: false}, function(result){
		chrome.storage.local.set({"mergeFilterLegend": !result.mergeFilterLegend}, function() {});
		document.getElementById("LegendFilter").checked = !result.mergeFilterLegend
	})
	FilterEvent()
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
if (window.location.href == "https://account.aq.com/AQW/Inventory") {
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
	
	
	// Exclude search pages for false positives 
	if (window.location.href.includes(wiki_searchpage)) {
		var isMerge = false 
		var isQuest = false 
		var isShop = false 
		var isMonster = false 
	}
	

	if (isMerge) {
		window.addEventListener('load', function () {
			async function _add() {
				var element = document.getElementsByClassName("yui-nav")[0];
				
				
				var liMergeFilters = document.createElement("li")
				liMergeFilters.id = "MergeFilter"
				liMergeFilters.onclick = null 
				liMergeFilters.innerHTML = `<b class="grayBox" id="pad"  >Filters ></b>
				<input id="NormalFilter" type='checkbox' style="margin-left:5px;"> </input>
				<img src="`+normal_icon+`" alt="normal_icon.png" class="image">
				
				<input id="AcFilter" type='checkbox' style="margin-left:5px;"> </input>
				<img src="http://aqwwiki.wdfiles.com/local--files/image-tags/acsmall.png" alt="acsmall.png" class="image">
				<input id="LegendFilter" type='checkbox' style="margin-left:5px;"> </input>
				<img src="http://aqwwiki.wdfiles.com/local--files/image-tags/legendsmall.png" alt="legendsmall.png" class="image">
				
				`
				
				element.append(liMergeFilters)
				
				
				
				filterAcInput = document.getElementById("AcFilter")
				filterAcInput.onclick = function(){setFilterAc();resetFilterMerge();TagFilterMerge(filterNormalInput.checked, filterAcInput.checked, filterLegendInput.checked);return false; }
		
				filterNormalInput = document.getElementById("NormalFilter")
				filterNormalInput.onclick = function(){setFilterNormal();resetFilterMerge();TagFilterMerge(filterNormalInput.checked, filterAcInput.checked, filterLegendInput.checked);return false; }
				
				filterLegendInput = document.getElementById("LegendFilter")
				filterLegendInput.onclick = function(){setFilterLegend();resetFilterMerge();TagFilterMerge(filterNormalInput.checked, filterAcInput.checked, filterLegendInput.checked);return false; }
		
		
				chrome.storage.local.get({mergeFilterNormal: false}, function(result){
					filterNormalInput.checked = result.mergeFilterNormal
					chrome.storage.local.get({mergeFilterLegend: false}, function(result){
						filterLegendInput.checked = result.mergeFilterLegend
						chrome.storage.local.get({mergeFilterAc: false}, function(result){
							filterAcInput.checked = result.mergeFilterAc
							TagFilterMerge(filterNormalInput.checked, filterAcInput.checked, filterLegendInput.checked)
						})
						
					})
					
				})
				
				
				
				
				
				
			}
			setTimeout(_add,500); 
			// Don't ask it just sometimes doesn't work if timeout isn't specified and then is at beginning of list 
			// timeout fixes that edge case, no idea why it happens negative time loading?? idk.
			// It only appeared when changing css file (Possible that in relase this bug doesn't appears)
			
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
	
	chrome.storage.local.get({mergeFilterAc: []}, function(result){mergeFilterAc = result.mergeFilterAc;});
	chrome.storage.local.get({mergeFilterNormal: []}, function(result){mergeFilterNormal = result.mergeFilterNormal;});
	chrome.storage.local.get({mergeFilterLegend: []}, function(result){mergeFilterLegend = result.mergeFilterLegend;});
	


	
	
	
	
	// Get items and process it 
	chrome.storage.local.get({aqwitems: []}, function(result){
			var Items = result.aqwitems;
			
			if (isMerge) {
				DisplayCostMergeShop(Items, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
				FilterEvent = updateCostMergeShop.bind(null, Items, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
				
	
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
