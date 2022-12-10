// Merge Shop Calculation logic and display 
//
// Calculating process:
//    1. Get all items merged 
//			1.1 Filter some items | Already Acquired and AC tag Exclusive option 
//    2. Use costs of these items (From itemJson) 
//	  		2.1 (optional) Make single or few recursion to check if item required is in merge shop and use it costs 
//	  3. Sum all costs 
//
//
//
//
// What to display?
//  	Items left to farm 
let progressbarstyle = `<div style="width:200px" class="w3-light-grey">
  <div class="w3-container w3-green w3-center" style="width:25%">25%</div>
</div><br>`

function sum2Dicts(dict1, dict2) {
	for (var [key, value] of Object.entries(dict2)) {
		if (dict1[key] == undefined) {
			dict1[key] = value 
		} else {
			dict1[key] += value 
		}
	};
	return dict1
}


function processTable(table,onlyAc,Items) {
	var tabRet = {} 
	var tableTrElements = table.getElementsByTagName("tr")
	
	var tableOffset = 2 

	
	var AlreadyExists = 0 

	for (var i = 0; i < tableTrElements.length; i++) {
		if (i == 0) {
			
			
		} else { // Skip first element Table Names 
			var elementsA = tableTrElements[i].getElementsByTagName("td")[tableOffset].querySelectorAll("a")
			var skip = false 
		
			
			for (var x = 0; x < elementsA.length; x++) {
				var proc = elementsA[x] 
				
				
				var itemElement= proc.parentNode.previousElementSibling
				var itemHtml = itemElement.innerHTML
		
				if (Items.includes(itemElement.textContent.toLowerCase().trim())) {
					var AlreadyExists = AlreadyExists + 1 
					skip = true 
				}
				
				if (itemHtml.includes("acsmall.png")) {
				}  else if (onlyAc) {
					skip = true 
				}
			
			
			
				if (itemHtml.includes("raresmall.png")) {
					skip = true // Always skip rare 
				}
				
			
				
			
				try {
					if (!skip) {
						
						var itemName = proc.lastChild.textContent
						var itemAmount= elementsA[x].nextSibling.data.replace("x","")
						var amount = parseInt(itemAmount)
						if (isNaN(amount)) {
							var amount = 1  
						}
						if (tabRet[itemName] !== undefined) {
							tabRet[itemName] += amount
						} else {
							tabRet[itemName] = amount
						}
					}
				} 
				catch(err){
					try {
						if (!skip) {
							var itemName = proc.childNodes[0].textContent
							var itemAmount= elementsA[x].nextSibling.data.replace("x","")
							if (itemName != "") {
								var amount = parseInt(itemAmount)
								if (isNaN(amount)) {
									var amount = 1 
								}
								if (tabRet[itemName] !== undefined) {
									tabRet[itemName] += amount
								} else {
									tabRet[itemName] = amount
								}
								
							}
						}
					} catch(err) {
						
					}
				}
					
			}
			
		}
	}
	
	return [AlreadyExists, tabRet] 
	
}

function translateUnidentified(itemname) {
	var _UndArray_0 = json_data["Names"]
	var _UndArray_1 = json_data["Translation"]
  
	if (itemname.includes("unidentified")) {
		for (var x = 0; x < _UndArray_0.length; x++) {
			if (itemname == _UndArray_0[x]) {
				return _UndArray_1[x];
			}
		}
	}
	return itemname;
}
function processAllMergeShopItems(tabAmount,Items,onlyAc) {
	var needDict = {} 
	var Found = 0 

	for (var xr = 0; xr < tabAmount; xr++) { 
		var table = document.getElementById("wiki-tab-0-"+xr).getElementsByClassName("wiki-content-table")[0] 
		
		var x = processTable(table,onlyAc,Items)
		var Found = Found + x[0] 
		needDict = sum2Dicts(needDict,x[1]) 
		
	}
	return [Found, needDict]
		
	
}


function sortBiggset(dict) {
	newDict = {}
	tempDict = Object.entries(dict).sort((a,b) => b[1] - a[1])
	tempDict.forEach(([key, value]) => { 
		newDict[key] = value 
	})
	delete tempDict
	return newDict
}


function DisplayCost(needDict, tabAmount, frame, Items) {
	let element = document.createElement("table");
	let mergeshopAcquiredItems = document.getElementsByClassName("Acquired").length - document.getElementsByClassName("RescourceAcquired").length;
	let mergeshopItemsAmount = document.getElementsByTagName("tr").length - document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length;
	
	let tableHeader = `<div class='yui-content'><tbody><th>Item Needed</th><th>Amount</th><th>You Have</th><th>Left</th>`;
	let tableBody = "";
	
	
	needDict = sortBiggset(needDict)
	

	Object.entries(needDict).forEach(([key, value]) => { 
		if (value !== "") {
			if (Items.includes(translateUnidentified(key.toLowerCase()))) {
				var accountAmount = parseInt(Type[Items.indexOf(translateUnidentified(key.toLowerCase()))][1])
				if (isNaN(accountAmount)) {
					var accountAmount = 1 //Item Is Armor Weapon etc.
				}
			} else {
				var accountAmount = 0
			}
			
			var leftAmount = parseInt(value) - accountAmount 
			
			try {
				var itemHref = items_json[key][0]
			} catch(err) {
				var itemHref = "" 
			}
			
			if (leftAmount <= 0) {
				leftAmount=0
				
				tableBody += `<tr><td style='color:gray;text-decoration: line-through;'><a href="${itemHref}">${key}</a></td><td>${value}</td><td style="color:green;">${accountAmount}</td><td>${leftAmount}</td></tr>`
			}
			else {
				tableBody += `<tr><td ><a style='color:white;' href="${itemHref}">${key}</a></td><td>${value}</td><td style='color:red;'>${accountAmount}</td><td>${leftAmount}</td></tr>`	
			}
			
		}
	});

	
	element.className = "wiki-content-table";
	element.style = "position:relative;float:right;align:left;text-align: center;width:100%";
	element.innerHTML = tableHeader + tableBody;
	
	frame.appendChild(element);
}


function repairSpan() {
	// Repairs span being on top of page caused by additional html to side, but caused by webpage improper use of <hr> in end of class="page-content" instead in beggining of "page-tags", this issue is only if width is too big.
	var hrElement = document.querySelectorAll("hr")
	pageTagElement = document.getElementsByClassName("page-tags")[0]
	hrElement = hrElement[hrElement.length-1]
	divElement = hrElement.nextElementSibling
	
	cloneDiv = divElement.cloneNode() 
	cloneDiv.innerHTML = divElement.innerHTML
	hrElement.remove() 
	divElement.remove()
	
	pageTagElement.prepend(cloneDiv)
}




async function DisplayCostMergeShop(Items) {
	repairSpan()
	let tabAmount = document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length
	let Frame = document.createElement("div") 
	Frame.className = "CostMerge"
	Frame.style = "display:inline-block;position:relative;float:right;"
	
	const {mergeFilterAc = false} = await chrome.storage.local.get('mergeFilterAc');

	
	var dc = processAllMergeShopItems(tabAmount,Items,mergeFilterAc)
	DisplayCost(dc[1], tabAmount, Frame, Items)	
	
	
	let Element = document.createElement("table")
	
	let mergeshopAcquiredItems = dc[0]
	
	let mergeshopItemsAmount = document.getElementsByTagName("tr").length - document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length
	if (mergeFilterAc) {
		var temp = document.getElementById("page-content").innerHTML
		mergeshopItemsAmount = (temp.match(/acsmall/g) || []).length/2;
	}
	
	Element.className = "wiki-content-table"
	Element.style = "position:relative;align:left;width:100%;"
	Element.innerHTML = "<div class='yui-content'><table class=;wiki-content-table;><tbody><th>Items in Merge Shop</th><th>Acquired</th><tr><td style='text-align:center'>"+mergeshopItemsAmount+"</td><td>"+mergeshopAcquiredItems+"</td></tbody></table></div>"
	
	let ProgressbarElement = document.createElement("div")
	var progressWidth = parseInt(100*mergeshopAcquiredItems/mergeshopItemsAmount)
	if (progressWidth != 0) {
ProgressbarElement.innerHTML = `<br><div class="w3-dark-grey" style="text-align:center"><div class="w3-container w3-green w3-center" style="font-weight:800;width:${progressWidth}%">${progressWidth}%</div></div><br>`
	} else {
		ProgressbarElement.innerHTML = `<br><div style="font-weight:800;text-align:center" class="w3-dark-grey">0%</div><br>`
	}

	Frame.prepend(ProgressbarElement)
	let x = Element.cloneNode(true)
	Frame.prepend(x)
	
	//chrome.storage.local.get({mergeFilterAc: false}, function(result){var result = result });
	
	
	
	
	
	var el = document.getElementsByClassName("wiki-content-table")
	for (var xr = 0; xr < el.length; xr++) { 
		el[xr].style += "float:left;"
	}
	
	for (var xr = 0; xr < tabAmount; xr++) { 
		let FrameNode = Frame.cloneNode(true)
		document.getElementById("wiki-tab-0-"+xr).prepend(FrameNode)
		document.getElementById("wiki-tab-0-"+xr).style = "float: left;";
	}


}