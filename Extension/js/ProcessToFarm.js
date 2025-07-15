// ProcessWikiItem.js

// Get Json of Wiki Exclusion Suffixes 
var wiki_exclude_suffixes = getJson(chrome.runtime.getURL("data/wiki_exclude_suffixes.json"))
var collection_chests = getJson(chrome.runtime.getURL("data/collection_chests.json"))["chests"]
var items_json = getJson(chrome.runtime.getURL("data/WikiItems.json"))

// WIP stuff 

function isCollection(text) {
	let value = false 
	for (var x = 0; x < collection_chests.length; x++) {
		if (text.includes(collection_chests[x])) {
			let value = collection_chests[x]
			return value 
		}
	}
	return value 
}

function httpGet(theUrl, nodeList, arrayOffset, x, isMonster, isQuest, isMerge)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, true ); 
	let priceElement = document.createElement("a")
	
	xmlHttp.onreadystatechange = checkData;
	xmlHttp.send( null );
	function addElement() {
		if (isQuest || isMonster || isMerge || (document.location.href == "http://aqwwiki.wikidot.com/new-releases")) {
			nodeList[arrayOffset+x].prepend(priceElement)
		} else{
			nodeList[arrayOffset+x].appendChild(priceElement)
		}
	}

	
	
	function checkData() {
		
		if (xmlHttp.readyState == 4) {
			try{
			var Text = xmlHttp.responseText
			if (Text.includes(" Gold") || Text.includes(" AC")) {
				let cchest = isCollection(Text)
				
				if (cchest !== false) {
					price =  Text.split("Location:</strong>")[1].split("</a>")[0]
					title = "From Collection Chest: "+cchest 
					href = price.split(">")[0].split('"')[1]
					
					priceElement.href = href
					priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+collectionchest_icon+'"></img>'
					
					addElement()
				}
				else{
					var nm = "Location:</strong>"
					if (Text.includes("Locations:</strong>")) {
						var nm = "Locations:</strong>"
					}
					else{
						var nm = "Location:</strong>"
					}
					price =  Text.split(nm)[1].split("</a>")[0]
					title = "From Shop: "+price.split(">")[1]
					href = price.split(">")[0].split('"')[1]
					priceElement.href = href
					priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+shop_icon+'"></img>'
					addElement()
					
				}
				
			}
			if (Text.includes('Price:</strong>')) {
				if (Text.includes("N/A (Reward from the")){
					if (Text.includes("Open Treasure Chests")) {
						title = "From Treasure Chest"
						href = "http://aqwwiki.wikidot.com/twilly-s-quests#2"
						
						priceElement.href = href
						priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+treasurechest_icon+'"></img>'
						
						addElement()
					}
					else{
						price =  Text.split("N/A (Reward from the")[1]
						title = "From Quest: "+ price.split('>')[1].split('<')[0]
						href = price.split('href="')[1].split('"')[0]
						
						priceElement.href = href
						priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+quest_icon+'"></img>'
						
						addElement()
					}
				} 
				if (Text.includes("Reward from the:")){
					if (Text.includes("Wheel of Doom")){
						price =  "http://aqwwiki.wikidot.com/wheel-of-doom"
						title = "Dropped by Wheel of Doom"
						href = price 
						
						priceElement.href = href
						priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+whellofdoom_icon+'"></img>'
						
						addElement()
					}
				}
				if (Text.includes("Merge the following:")) {
					price =  Text.split("Location:</strong>")[1].split("</a>")[0]
					title = "From Merge Shop: "+price.split(">")[1]
					href = price.split(">")[0].split('"')[1]
					
					priceElement.href = href
					priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+mergeshop_icon+'"></img>'
					
					addElement()
				}
				if (Text.includes("Dropped by")) {
					
					price =  Text.split("Price:")[1].split("strong>")[1].split("<br>")[0].replaceAll('"','')
					
					if (price !== undefined) {
						title = "Dropped by "+price.split("</a>")[0].split("N/A (")[1].split(">")[1]
						href = price 
						
						priceElement.href = href.split("href")[1].split(">")[0].replace("=","http://aqwwiki.wikidot.com")
						priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+drop_icon+'"></img>'
						
						
						
						addElement()
						
					}
				}
				
			}
			if (Text.includes("Collection Chest")) {
				price = Text.split("Locations:")[1].split("</a>")[0].replaceAll('"','')
				if (price !== undefined){
				
					title = ""
					href = ""

					priceElement.href = href
					priceElement.innerHTML = '<img  title="'+title+'" style="width:22px" src="'+collectionchest_icon+'"></img></div>'
					addElement()
				}
			}
			
			delete xmlHttp

			return true
			
			} 
			catch (err) 
			{
			if (!err.toString().includes("split")) console.log({ err })
			return true
			}
		}
	}
}

function getWikiItemDetails(itemName) {
	let moreDetailIcon = document.createElement("a")
	
	items_json[itemName] 
}

function addItemDetailsIcon(details) {
	
}


	
async function ProcessAnyWikiItem(nodeList, arrayOffset, Buy, Category, Where, Type, x, isMonster, isQuest, isMerge) { 

	let nodeText = nodeList[arrayOffset+x].innerHTML; // No need for highlight 
	let nodeLink = nodeList[arrayOffset+x].href;
	

	
	if (nodeLink.includes("http://aqwwiki.wikidot.com/")){
		httpGet(nodeLink, nodeList, arrayOffset, x, isMonster, isQuest, isMerge);
	}
	
}
//


function processRescourceItem(Items, nodeText, nodeList, arrayOffset, x, isMerge, isQuest, isMonster) {
	var accountAmount = parseInt(Type[Items.indexOf(nodeText)][1] )
	var originalAmountCount = document.createElement("span") 
	var accountAmountCount = document.createElement("span") 
	
	if (isMerge || isMonster) {
		var count_node = nodeList[arrayOffset+x].nextSibling
		accountAmountCount.classList.add("RescourceAcquired")
	} else if (isQuest) {
		var count_node = nodeList[arrayOffset+x].parentNode.lastChild
	} 
	// ---- START OF FIX ----
    if (!count_node) {
        // If count_node was never found, stop the function here to prevent a crash.
        return; 
    }
    // ---- END OF FIX ----
	var originaAmount = count_node.data.replace(",","")
	
	if (originaAmount !== null && originaAmount !== undefined){ 
	
		originalAmountCount.innerHTML = originaAmount 
		accountAmountCount.innerHTML = accountAmount 

		if (isMonster == false) {
			if (parseInt(originaAmount.replace("x","")) <= accountAmount) {
				//stack_original.style = "color:black;
				accountAmountCount.style = "font-weight: bold;color:green;text-decoration:none;"
			}
			else {
				//stack_original.style = "color:black;"
				accountAmountCount.style = "font-weight: bold;color:red;text-decoration:none;"
			}
		} else {
			accountAmountCount.style = "font-weight: bold;color:green;"
		}
		
		

		
		count_node.data = " "
		return [originalAmountCount,accountAmountCount]
	}
	
}

async function addLocationIcon(nodeList, nodeText, Items, arrayOffset, x, isList, isMerge) {
	// where_icon 
	let where_icon = document.createElement("a");
	
	// Adds icons of where is located 	
	if (Where[Items.indexOf(nodeText)] == "Bank") {
		where_icon.innerHTML = " <img title='In Bank' style='height:20px' src='"+bank_icon+"'></img>"
		if (isList) {
			nodeList[arrayOffset+x].parentNode.appendChild(where_icon, nodeList[arrayOffset+x])

		} else if (isMerge || window.location.href == 'http://aqwwiki.wikidot.com/new-releases'){
				nodeList[arrayOffset+x].appendChild(where_icon)
		} 
		else {
			nodeList[arrayOffset+x].parentNode.appendChild(where_icon)
		}
		
		
	} else {
		if (isList) {
			where_icon.innerHTML = " <img title='In inventory' style='height:20px' src='"+inv_icon+"'></img>"
			nodeList[arrayOffset+x].parentNode.appendChild(where_icon, nodeList[arrayOffset+x])

		} else {
			where_icon.innerHTML = " <img title='In inventory' style='height:20px' src='"+inv_icon+"'></img>"
			nodeList[arrayOffset+x].appendChild(where_icon)
		}
	}	
	
}




async function ProcessWikiItem(nodeList, arrayOffset, Items, Buy, Category, Where, Type, x, isMerge, isList, isQuest, isMonster) {
	// getting text of item + removing not needed text (dosen't compare to inv) 
	let nodeText = nodeList[arrayOffset+x].innerHTML.replace("’","'").trim();
	
	
	// Use Wiki Excluded Suffixes json to remove unused suffixes 
	for (var i = 0; i < wiki_exclude_suffixes["Excluded"].length; i++) {
		nodeText = nodeText.replace(wiki_exclude_suffixes["Excluded"][i],"")
	}
	nodeText = nodeText.toLowerCase()
	
	
	
	
	// link of item /item-name 
	let nodeLink = nodeList[arrayOffset+x].href
	
	// [Edge Case] is rep if the link is just a link to /X-faction not a item 
	let isRep = !nodeLink.includes("-faction") // Skip Ranks in merge shop from checking 
	
	
	if (isRep) { 
		if (Items.includes(nodeText)) {
			nodeText = nodeText
			nodeList[arrayOffset+x].style = "font-weight: bold;color:green;"
			nodeList[arrayOffset+x].classList.add("Acquired")
			if (Type[Items.indexOf(nodeText)].length == 2 && window.location.href !== "http://aqwwiki.wikidot.com/misc-items") {
				// gets amount from inventory 
				var RescourceCount = processRescourceItem(Items, nodeText, nodeList, arrayOffset, x, isMerge, isQuest, isMonster);
			} else {
				var RescourceCount = false 
			}
			
			// Adds icons of where is located 	
			addLocationIcon(nodeList, nodeText, Items, arrayOffset, x, isList, isMerge)
			
			
			
			if (RescourceCount !== false){
				var Separator = document.createElement("b") 
				Separator.innerHTML = "/"
				if (RescourceCount[0].innerHTML == " "){
					RescourceCount[0].innerHTML = " x1"
				}
				
				if (isMerge) {
					
					nodeList[arrayOffset+x].parentNode.insertBefore(RescourceCount[1], nodeList[arrayOffset+x].nextSibling)
					nodeList[arrayOffset+x].parentNode.insertBefore(Separator, nodeList[arrayOffset+x].nextSibling)
					nodeList[arrayOffset+x].parentNode.insertBefore(RescourceCount[0], nodeList[arrayOffset+x].nextSibling)
				} 
				else{
					nodeList[arrayOffset+x].parentNode.appendChild(RescourceCount[0])
					nodeList[arrayOffset+x].parentNode.appendChild(Separator)
					nodeList[arrayOffset+x].parentNode.appendChild(RescourceCount[1])
				}
			}
			
			
			found += 1 //Count items found 
		}
	}
};
