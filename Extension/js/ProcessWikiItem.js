// ProcessWikiItem.js

		
// WIP stuff 

function httpGet(theUrl, nodeList, arrayOffset, x)
{
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, true ); 
	xmlHttp.onreadystatechange = checkData;
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
	xmlHttp.send( null );
    return true
}
async function ProcessAnyWikiItem(nodeList, arrayOffset, Buy, Category, Where, Type, x) { 

	let nodeText = nodeList[arrayOffset+x].innerHTML; // No need for highlight 
	let nodeLink = nodeList[arrayOffset+x].href;
	
	isHashtag = !nodeLink.includes("#");
	isSorting = !nodeLink.includes("sort-by-");
	
	
	if (isHashtag && isSorting) {
		if (nodeLink.includes("http://aqwwiki.wikidot.com/")){
			httpGet(nodeLink, nodeList, arrayOffset, x);
		}
	}
}
//



async function ProcessWikiItem(nodeList, arrayOffset, Items, Buy, Category, Where, Type, x) {
	// getting text of item + removing not needed text (dosen't compare to inv) 
	let nodeText = nodeList[arrayOffset+x].innerHTML.replace(" (0 AC)","").replace(" (AC)","").replace(" (Armor)","").replace(" (Legend)","").replace(" (temp)","").replace(" (Temp)","").replace(" (Special)","").replace(" (Misc)","").trim()
	
	// elements for Stackable Items 
	let stack_original = document.createElement("a");
	let stack_account = document.createElement("a");
	
	// link of item /item-name 
	let nodeLink = nodeList[arrayOffset+x].href
	
	// [Edge Case] is rep if the link is just a link to /X-faction 
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
				stack_original.innerHTML = String(" x"+needed_amount+"/")	
		
				
			
				// Stylizer for amount of items
				stack_account.innerHTML = String(amount)
				if (needed_amount <= amount) {
					stack_original.style = "color:black;"
					stack_account.style = "font-weight: bold;color:green;"
				}
				else {
					stack_original.style = "color:black;"
					stack_account.style = "font-weight: bold;color:red;"
				}
				
				if (isMerge) {
					// Dosen't require adding new element (Just replace , with / )
					count_node.data = count_node.data.replace(",","")+"/"
					// Ads new element 
					nodeList[arrayOffset+x].parentNode.insertBefore(stack_account, nodeList[arrayOffset+x].nextSibling.nextSibling)
					
				}
				else {
					// erases previous data 
					count_node.data = ""
					
					// Adds new element 
					nodeList[arrayOffset+x].parentNode.appendChild(stack_original) 
					nodeList[arrayOffset+x].parentNode.appendChild(stack_account) 
				
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

