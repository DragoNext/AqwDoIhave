/* Main.js */ 

const bank_icon = chrome.runtime.getURL("images/in_bank.png")
const inv_icon = chrome.runtime.getURL("images/in_inventory.png")
const price_icon = chrome.runtime.getURL("images/price_icon.png");
const drop_icon = chrome.runtime.getURL("images/monster_drop.png")
const collectionchest_icon = chrome.runtime.getURL("images/collectionchest_icon.png")
const inventory_update_icon = chrome.runtime.getURL("images/update_inventory.png")
const found_items_banner = chrome.runtime.getURL("images/tab.png")

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
	var elementList = document.querySelectorAll("tr")

	for (var x = 0; x < elementList.length; x++) {
		if (elementList[x].querySelectorAll("td").length == 3) {
			var checkAc = elementList[x].innerHTML.includes("acsmall.png")
			var checkLegend = elementList[x].innerHTML.includes("legendsmall.png")
			var checkNormal = !checkAc && !checkLegend

			elementList[x].hidden = shouldHideByFilter(normal, ac, legend, checkNormal, checkAc, checkLegend)
		}
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

function applyTabButtonHover(button) {
	button.style.transition = "filter 120ms ease";
	button.addEventListener("mouseenter", function() {
		button.style.filter = "brightness(1.08)";
	});
	button.addEventListener("mouseleave", function() {
		button.style.filter = "";
	});
}

function addToFarm_button() {
	const header = document.getElementById("side-bar")
	var ToFarm = document.createElement("button")
	ToFarm.onclick = function() { goto_ToFarm(); return false; }
	ToFarm.type = "button";
	ToFarm.textContent = "AqwDoIHave {Extras};";
	ToFarm.style.backgroundColor = "transparent";
	ToFarm.style.backgroundImage = "url('" + found_items_banner + "')";
	ToFarm.style.backgroundRepeat = "no-repeat";
	ToFarm.style.backgroundSize = "100% 100%";
	ToFarm.style.border = "none";
	ToFarm.style.color = "#ffffff";
	ToFarm.style.cursor = "pointer";
	ToFarm.style.display = "block";
	ToFarm.style.fontSize = "11px";
	ToFarm.style.fontWeight = "800";
	ToFarm.style.height = "29px";
	ToFarm.style.lineHeight = "1";
	ToFarm.style.margin = "0 0 8px";
	ToFarm.style.minWidth = "140px";
	ToFarm.style.padding = "0 14px 2px";
	ToFarm.style.textAlign = "center";
	ToFarm.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 0 #000";
	ToFarm.style.whiteSpace = "nowrap";
	applyTabButtonHover(ToFarm);
	header.prepend(ToFarm)
	
}

function getTitleActionWrap(titleElement) {
	var existing = document.getElementById("aqw-title-actions");
	if (existing) {
		return existing;
	}

	var wrap = document.createElement("span");
	wrap.id = "aqw-title-actions";
	wrap.style.display = "inline-flex";
	wrap.style.alignItems = "center";
	wrap.style.gap = "8px";
	wrap.style.marginLeft = "8px";
	wrap.style.verticalAlign = "middle";
	wrap.style.whiteSpace = "nowrap";

	var insertBeforeNode = null;
	for (var i = 0; i < titleElement.childNodes.length; i++) {
		var child = titleElement.childNodes[i];
		if (child.nodeType === 1 && /^(P|DIV|BR|SUB)$/i.test(child.tagName)) {
			insertBeforeNode = child;
			break;
		}
	}

	if (insertBeforeNode) {
		titleElement.insertBefore(wrap, insertBeforeNode);
	} else {
		titleElement.appendChild(wrap);
	}
	return wrap;
}

function addUpdateInventory_button() {
	const Title = document.getElementById("page-title")
	const actionWrap = getTitleActionWrap(Title)
	const updateInventory = document.createElement("button")
	updateInventory.onclick = () => processAcountBackground();
	updateInventory.type = "button";
	updateInventory.textContent = "UPDATE INVENTORY";
	updateInventory.style.backgroundColor = "transparent";
	updateInventory.style.backgroundImage = "url('" + found_items_banner + "')";
	updateInventory.style.backgroundRepeat = "no-repeat";
	updateInventory.style.backgroundSize = "100% 100%";
	updateInventory.style.border = "none";
	updateInventory.style.color = "#ffffff";
	updateInventory.style.cursor = "pointer";
	updateInventory.style.display = "inline-flex";
	updateInventory.style.alignItems = "center";
	updateInventory.style.justifyContent = "center";
	updateInventory.style.fontSize = "11px";
	updateInventory.style.fontWeight = "800";
	updateInventory.style.height = "29px";
	updateInventory.style.lineHeight = "1";
	updateInventory.style.minWidth = "140px";
	updateInventory.style.padding = "0 14px 2px";
	updateInventory.style.textAlign = "center";
	updateInventory.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 0 #000";
	updateInventory.style.verticalAlign = "middle";
	updateInventory.style.whiteSpace = "nowrap";
	applyTabButtonHover(updateInventory);
	actionWrap.appendChild(updateInventory)
	

}

function styleFoundInfoBanner(foundInfo) {
	foundInfo.style.display = "inline-flex";
	foundInfo.style.alignItems = "center";
	foundInfo.style.justifyContent = "center";
	foundInfo.style.minWidth = "140px";
	foundInfo.style.height = "29px";
	foundInfo.style.padding = "0 14px 2px";
	foundInfo.style.verticalAlign = "middle";
	foundInfo.style.backgroundImage = "url('" + found_items_banner + "')";
	foundInfo.style.backgroundRepeat = "no-repeat";
	foundInfo.style.backgroundSize = "100% 100%";
	foundInfo.style.color = "#ffffff";
	foundInfo.style.fontWeight = "800";
	foundInfo.style.fontSize = "11px";
	foundInfo.style.lineHeight = "1";
	foundInfo.style.letterSpacing = "0.4px";
	foundInfo.style.textShadow = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 0 #000";
	foundInfo.style.whiteSpace = "nowrap";
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



async function processAcount() {
	var jsonData = await fetchInventoryData();
	var data = ProcessAccountItems(jsonData);

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
	// page load — fetch inventory from JSON API
	document.addEventListener('DOMContentLoaded', async function(event) {
		await accountDataReady;
		await processAcount();
	})
	
	
	
// Wiki Page Handling 
} else {

	// Adds theme if enabled 
	chrome.storage.local.get({darkmode: 0}, function(result){
		if(result.darkmode) {
			addCss(chrome.runtime.getURL("themes/dark.css"));
		}
	});
	
	// page load
	document.addEventListener('DOMContentLoaded', async function(event) {
	await dataReady;
	await accountDataReady;

	// Removes width bar [Not even usefull]
	var Body = document.getElementsByTagName('body')[0]
	Body.style = Body.style +";overflow-x: hidden;";


	// Get title of Wiki page (Name of category basically) 
	const Title = document.getElementById("page-title")
	const Content = document.getElementById("page-content")
	const baseTitleText = Title ? Title.textContent.trim() : ""
	
	// Creates Found amount element near title. 
	var found_info = document.createElement("span")
	found_info.textContent = "Found 0 Items"
	styleFoundInfoBanner(found_info)
	getTitleActionWrap(Title).appendChild(found_info)
	
	
	
	
	
	
	addUpdateInventory_button()
	addToFarm_button()
	if (typeof initWikiQuestChainFeature === "function") {
		initWikiQuestChainFeature(Content)
	}
	
	
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
			var Items = (result.aqwitems || []).map(function(item) {
				return normalizeInventoryKey(item);
			});

			// Build a Map for O(1) lookups instead of O(n) Items.includes/indexOf scans
			var ItemsMap = new Map();
			for (var i = 0; i < Items.length; i++) {
				if (!ItemsMap.has(Items[i])) {
					ItemsMap.set(Items[i], i);
				}
			}

			if (markOwnedPageTitle(Title, baseTitleText, ItemsMap, Where, Type)) {
				found += 1;
			}

			if (isMerge) {
				DisplayCostMergeShop(Items, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
				FilterEvent = updateCostMergeShop.bind(null, Items, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
			}

			// Iterate over nodelist with array offset applied
			for (var x = 0; x < arrayList.length; x++) {

				ProcessWikiItem(nodeList, arrayOffset, Items, ItemsMap, Buy, Category, Where, Type, x, isMerge, isList, isQuest, isMonster)

			}

			// Displays found amount
			found_info.textContent = "Found " + found + " Items"

	})
	
	})
	
	
}
