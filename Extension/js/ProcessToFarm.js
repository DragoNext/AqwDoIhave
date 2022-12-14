// Whole Wiki Pre processed using python script 

// How it looks?
//
//	{Name}: [Data]
//
//	Data:
//		0 - Type >> Item/Monster/Location 
//		1 - href >> Link To Item 
//      2 - >> 
var ac_large = "http://aqwwiki.wdfiles.com/local--files/image-tags/aclarge.png"
var rare_large = "http://aqwwiki.wdfiles.com/local--files/image-tags/rarelarge.png"
var seasonal_large = "http://aqwwiki.wdfiles.com/local--files/image-tags/seasonallarge.png"
var legend_large = "http://aqwwiki.wdfiles.com/local--files/image-tags/legendlarge.png"



function getJson(theUrl)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, false ); 
	xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText)
}

var items_json = getJson(chrome.runtime.getURL("data/WikiItems.json"))
var wiki_exclude_suffixes = getJson(chrome.runtime.getURL("data/wiki_exclude_suffixes.json"))



async function add_to_table(table,item_name,item_details, av_item_count, avaliableItemsElement){
	let tr = document.createElement("tr") 
	let td_1 = document.createElement("td")
	let td_2 = document.createElement("td")
	let td_3 = document.createElement("td")
	av_item_count+=1
	
	td_1.innerHTML = item_name
	
	if (item_details[1][1][0] == "Drop" || item_details[1][1][0] == "Quest" || item_details[1][1][0] == "Merge") {
		if  (item_details[1][1][1] !== "") {
			td_2.innerHTML = "<a href='http://aqwwiki.wikidot.com/"+item_details[1][1][2]+"'>"+item_details[1][1][1]+"</a>"
			
		} else {
			td_2.innerHTML = item_details[1][1][1][0]
		}
	} else {
		td_2.innerHTML = "N/A"
	}
	
	// Monster Drop Icon
	if (item_details[1][1][0] == "Drop") {
		td_3.innerHTML = td_3.innerHTML + "<img style='height:20px' src='"+drop_icon+"'></img>"
	}
	// Quest Icon
	if (item_details[1][1][0] == "Quest") {
		td_3.innerHTML = td_3.innerHTML + "<img style='height:20px' src='"+quest_icon+"'></img>"
	}
	// Merge Icon
	if (item_details[1][1][0] == "Merge") {
		td_3.innerHTML = td_3.innerHTML + "<img style='height:20px' src='"+mergeshop_icon+"'></img>"
	}
	// Ac Icon
	if (item_details[6][1] == true) {
		td_3.innerHTML = td_3.innerHTML + "<img style='height:20px' src='"+ac_large+"'></img>"
	}
	// Legend Icon
	if (item_details[7][1] == true) {
		td_3.innerHTML = td_3.innerHTML + "<img style='height:20px' src='"+legend_large+"'></img>"
	}
	// Seasonal Icon
	if (item_details[8][1] == true) {
		td_3.innerHTML = td_3.innerHTML + "<img style='height:20px' src='"+seasonal_large+"'></img>"
	}
	
	tr.appendChild(td_1)
	tr.appendChild(td_2)
	tr.appendChild(td_3)
	table.appendChild(tr)

	
}

function processToFarmItem(item_name,item_details,table) {
	add_to_table(table,item_name,item_details)
}


	
function reProcess_ToFarm_Page() {
	var table_element = document.getElementById("table-content")
	table_element.innerHTML = "" 
	process_ToFarm_Page()
}






function filterItem(item_name, item_data, account_items) {
		// Filters check boxes True/False On/Off
		var Filter_AcItem = document.getElementById("Filter_AcItem").checked 
		var Filter_LegendItem = document.getElementById("Filter_LegendItem").checked 
		var Filter_NormalItem = document.getElementById("Filter_NormalItem").checked 
		var Filter_SeasonalItem = document.getElementById("Filter_SeasonalItem").checked 
		var Filter_MonsterDrop = document.getElementById("Filter_MonsterDrop").checked 
		var Filter_MergeDrop = document.getElementById("Filter_MergeDrop").checked 
		var Filter_QuestDrop = document.getElementById("Filter_QuestDrop").checked 
		
		
		// Gets Tag exclusion from wiki_exclude_suffixes.json and make it smaller to compare with account_items 
		let cq = item_name.toLowerCase()
		for (var i = 0; i < wiki_exclude_suffixes["Excluded"].length; i++) {
			cq = cq.replace(wiki_exclude_suffixes["Excluded"][i].toLowerCase(), "")
		} 
		
		
		
		// Filter Drop Type on if any is TRUE and ITEM is of type it will return False (Skip Item) 
		if (item_data[1][1][0] == "Drop" && Filter_MonsterDrop == false) {
			return false 
		}
		if (item_data[1][1][0] == "Quest" && Filter_QuestDrop == false) {
			return false 
		}
		if (item_data[1][1][0] == "Merge" && Filter_MergeDrop == false) {
			return false 
		}
		
		
		if (item_data[5] != undefined) {
			// item_data[5] if undefined, the object isn't presentable (Item dosen't have data if its AC)
			if (account_items.includes(cq)) {
				
				return false 
				
			} 
			else if (item_data[14] == "necklaces" || item_data[14] == "misc-items") {
				// Exclude Misc Items and Necklaces 
				return false 
			} else if (item_data[8][1] && Filter_SeasonalItem == false) {
				// Seasonal Filter 
				return false 
			} else if (item_data[6][1] == false && Filter_NormalItem == false) { 
					// Ac Filter 
					return false 			
			} 
			
			else if (item_data[5][1] == true) { 
				// Excludes Rare Tag  
					return false 			
			} 
			
			else if (item_data[1][1][0] == "Drop" || item_data[1][1][0] == "Quest" || item_data[1][1][0] == "Merge") {
				if (item_data[1][1][0] == "Merge") {
					if (item_data[1][1][1].includes("Doom Merge")) {
						// Ignore Doom Merge 
						return false 
					} else {
						// Normal Merge Drop Item 
						return true 
					}
				} else if (item_data[1][1][0] == "Quest") {
					if (item_data[1][1][1] == "Open Treasure Chests" || item_data[1][1][1] == "Wheel of Doom") {
						// Ignore Open Chest 
						return false 
					}
					else{
						// Normal Quest Drop Item
						return true 
					}
				} else {
					// Normal Monster Drop Item 
					return true
				}
			}
			else {
				return false 
			}
		}
		else {
			// Failed to retrive item ._.
			// Fault of scraper in 99.99% of times.
		}
}

async function process_ToFarm_Page() {
	
	// Count of ac - account, and av - avaliable items
	var av_item_count = 0 
	var ac_item_count = 0 
	
	
	
	const item_keys = Object.keys(items_json)
	
	var table_element = document.getElementById("table-content")
	
	
	var avaliableItemsElement = document.getElementById("av-items")
	var accounteItemsElement = document.getElementById("ac-items")
	avaliableItemsElement.innerHTML = "Avaliable Items: "+av_item_count
	accounteItemsElement.innerHTML = "Account Items: "+ac_item_count
	
	
	chrome.storage.local.get({aqwitems: []}, function(result){
		var account_items = result.aqwitems
		ac_item_count = result.aqwitems.length
		for (var x = 0; x < item_keys.length; x++) {

			if (filterItem(item_keys[x], items_json[item_keys[x]], account_items)) {
				processToFarmItem(item_keys[x], items_json[item_keys[x]],table_element, av_item_count, avaliableItemsElement)
				av_item_count+= 1
			}
		}
		avaliableItemsElement.innerHTML = "Avaliable Items: "+av_item_count	
		accounteItemsElement.innerHTML = "Account Items: "+ac_item_count	
		
	})
}
const drop_icon = chrome.runtime.getURL("images/monster_drop.png")
const quest_icon = chrome.runtime.getURL("images/quest_icon.png")
const mergeshop_icon = chrome.runtime.getURL("images/mergeshop_icon.png")


if (window.location.href.includes("tofarm.html")) {
	
	document.addEventListener('DOMContentLoaded', function(event) {
		
		
		var dropFilter = document.getElementById("bossdrop")
		dropFilter.src = drop_icon
		
		var dropFilter = document.getElementById("mergeshopdrop")
		dropFilter.src = mergeshop_icon
		
		var dropFilter = document.getElementById("questdrop")
		dropFilter.src = quest_icon
		
		
		process_ToFarm_Page()
		
		document.getElementById('Filter_AcItem').addEventListener('click',
			reProcess_ToFarm_Page);
		document.getElementById('Filter_LegendItem').addEventListener('click',
			reProcess_ToFarm_Page);		
		document.getElementById('Filter_NormalItem').addEventListener('click',
			reProcess_ToFarm_Page);
		document.getElementById('Filter_SeasonalItem').addEventListener('click',
			reProcess_ToFarm_Page);	
		document.getElementById('Filter_MonsterDrop').addEventListener('click',
			reProcess_ToFarm_Page);	
		document.getElementById('Filter_MergeDrop').addEventListener('click',
			reProcess_ToFarm_Page);	
		document.getElementById('Filter_QuestDrop').addEventListener('click',
			reProcess_ToFarm_Page);
		
	})	
}