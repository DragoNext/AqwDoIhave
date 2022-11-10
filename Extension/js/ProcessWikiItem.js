// ProcessWikiItem.js

// Get Json of Wiki Exclusion Suffixes 
var wiki_exclude_suffixes = getJson(chrome.runtime.getURL("data/wiki_exclude_suffixes.json"))


// WIP stuff 

function httpGet(theUrl, nodeList, arrayOffset, x)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, true ); 
	let priceElement = document.createElement("a")
	
	xmlHttp.onreadystatechange = checkData;
	xmlHttp.send( null );
	
	function checkData() {
		
		if (xmlHttp.readyState == 4) {
			try{
			var Text = xmlHttp.responseText
			
			if (Text.includes('Price:</strong>')) {
				if (Text.includes("Dropped by")) {
					
					price =  Text.split("Price:")[1].split("strong>")[1].split("<br>")[0].replaceAll('"','')
					
					if (price !== undefined) {
						title = "Dropped by "+price.split("</a>")[0].split("N/A (")[1].split(">")[1]
						href = price 
						
						priceElement.href = href.split("href")[1].split(">")[0].replace("=","http://aqwwiki.wikidot.com")
						priceElement.innerHTML = '<img title="'+title+'" style="width:22px" src="'+drop_icon+'"></img>'
						
						
						
						nodeList[arrayOffset+x].appendChild(priceElement)
						
					}
				}
				if (Text.includes("Collection Chest")) {
					price = Text.split("Locations:")[1].split("</a>")[0].replaceAll('"','')
					if (price !== undefined){
					
						title = price.replace("</strong></p>","").replace("<ul>","").replace("<li>","")
						href = price.split("href")[1].split(">")[0].replace("=","http://aqwwiki.wikidot.com")

						priceElement.href = href
						priceElement.innerHTML = '<img  title="'+title+'" style="width:22px" src="'+collectionchest_icon+'"></img></div>'
						nodeList[arrayOffset+x].appendChild(priceElement)
						}
					}
			}

			delete xmlHttp

			return true
			
			}catch(err){return true}
		}
	}
}
	
async function ProcessAnyWikiItem(nodeList, arrayOffset, Buy, Category, Where, Type, x) { 

	let nodeText = nodeList[arrayOffset+x].innerHTML; // No need for highlight 
	let nodeLink = nodeList[arrayOffset+x].href;
	

	
	if (nodeLink.includes("http://aqwwiki.wikidot.com/")){
		httpGet(nodeLink, nodeList, arrayOffset, x);
	}
	
}
//



async function ProcessWikiItem(nodeList, arrayOffset, Items, Buy, Category, Where, Type, x, isMerge, isList) {
	// getting text of item + removing not needed text (dosen't compare to inv) 
	let nodeText = nodeList[arrayOffset+x].innerHTML.replace("’","'").trim();
	
	
	// Use Wiki Excluded Suffixes json to remove unused suffixes 
	for (var i = 0; i < wiki_exclude_suffixes["Excluded"].length; i++) {
		nodeText = nodeText.replace(wiki_exclude_suffixes["Excluded"][i],"")
	}
	nodeText = nodeText.toLowerCase()
	
	
	
	
	// elements for Stackable Items 
	let stack_original = document.createElement("a");
	let stack_account = document.createElement("a");
	
	
	// where_icon 
	let where_icon = document.createElement("a");

	
	// link of item /item-name 
	let nodeLink = nodeList[arrayOffset+x].href
	
	// [Edge Case] is rep if the link is just a link to /X-faction not a item 
	let isRep = !nodeLink.includes("-faction") // Skip Ranks in merge shop from checking 
	
	
	if (isRep) { 
		if (Items.includes(nodeText)) {
			nodeText = nodeText
			nodeList[arrayOffset+x].style = "font-weight: bold;color:green;"
			
			
			// Adds icons of where is located 	
			if (Where[Items.indexOf(nodeText)] == "Bank") {
				where_icon.innerHTML = " <img title='In Bank' style='height:20px' src='"+bank_icon+"'></img>"
				if (isList) {
					nodeList[arrayOffset+x].parentNode.appendChild(where_icon, nodeList[arrayOffset+x])
	
				} else if (isMerge){
						nodeList[arrayOffset+x].appendChild(where_icon)
				} 
				else {
					nodeList[arrayOffset+x].parentNode.appendChild(where_icon)
				}
				
				
			} else {
				where_icon.innerHTML = " <img title='In inventory' style='height:20px' src='"+inv_icon+"'></img>"
				nodeList[arrayOffset+x].appendChild(where_icon)
			}	
			
			
			if (Type[Items.indexOf(nodeText)].length == 2 && document.URL !== "http://aqwwiki.wikidot.com/misc-items") {
				// gets amount from inventory 
				let amount = parseInt(Type[Items.indexOf(nodeText)][1] )
				
				// Geting location of item drop count or location next to item found
				if ( isMerge ) { 
					var count_node = nodeList[arrayOffset+x].nextSibling
				} else {
					var count_node = nodeList[arrayOffset+x].parentNode.lastChild
				}
				if (count_node.data == undefined || count_node.data == null ) {
					var count_node = nodeList[arrayOffset+x].nextSibling
				}

				
				// detection for monster drop that has range 
				if (count_node !== null && count_node !== undefined){
					if (count_node.data.includes("-")) {
						var needed_amount = count_node.data.slice(2).replace(" ","");
					} else {
						var needed_amount = parseInt(count_node.data.slice(2).replace(",",""));
						
					}
				}
				
				
				// formating original amount / needed amount to final result.
				if (isNaN(needed_amount)) {
					needed_amount=1;
				}; 
				stack_original.innerHTML = " x"+needed_amount+"/"
				
			
				// Stylizer for amount of items
				stack_account.innerHTML = String(amount)
				if (needed_amount <= amount) {
					//stack_original.style = "color:black;"
					stack_account.style = "font-weight: bold;color:green;"
				}
				else {
					//stack_original.style = "color:black;"
					stack_account.style = "font-weight: bold;color:red;"
				}
				
			
					
				
				
				
				if (isMerge) {

					// Dosen't require adding new element (Just replace , with / )
					count_node.data = count_node.data.replace(",","")+"/"
					// Ads new element 
					nodeList[arrayOffset+x].parentNode.insertBefore(stack_account, nodeList[arrayOffset+x].nextSibling.nextSibling)	
				} else {
					// erases previous data 
					
					
					// Adds new element 
					nodeList[arrayOffset+x].parentNode.appendChild(stack_original) 
					nodeList[arrayOffset+x].parentNode.appendChild(stack_account) 
				
					

	
				}
				
				
				
			
			}
			
			
			
			
			found += 1 //Count items found 
		}
	}
};

