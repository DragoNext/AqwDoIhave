// Merge Shop Calculation logic and display 
//
// To add:
// 	Condition when merge shop is empty telling Not Found Anything something like 
let progressbarstyle = `<div style="width:200px" class="w3-light-grey">
  <div class="w3-container w3-green w3-center" style="width:25%">25%</div>
</div><br>`

let mergeData = {}

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

// For debugging data (Not Important)
function download(content, fileName, contentType) {
    var a = document.createElement("a");
    var file = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}

function mergeObjects(obj1,obj2){
    var obj3 = {};
    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
    for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
    return obj3;
}

function processTable(table,Items) {
	var tabRet = {} 
	
	var itemTable = {} 
	
	var tableTrElements = table.getElementsByTagName("tr")
	
	var tableOffset = 2 

	
	var AlreadyExists = 0 

	for (var i = 0; i < tableTrElements.length; i++) {
		if (i === 0) {
			
		} else { // Skip first element Table Names 

			var isItemAc     = false  
			var isItemLegend = false 
			var isItemNormal = false 
			
			var elementsA = tableTrElements[i].getElementsByTagName("td")[tableTrElements[i].getElementsByTagName("td").length-1].querySelectorAll("a")
			
			var itemElement= tableTrElements[i].getElementsByTagName("td")[1]
			var itemHtml = itemElement.innerHTML
			var itemText = itemElement.textContent
			
			var skip = false 
			var itemsFound = [] 
			
			for (var x = 0; x < elementsA.length; x++) {
				var proc = elementsA[x] 
				
				for (var ax = 0; ax < wiki_exclude_suffixes["Excluded"].length; ax++) {
					itemText = itemText.replace(wiki_exclude_suffixes["Excluded"][ax],"")
				}
				
			
			
				if (itemHtml.includes("acsmall.png")) {
					isItemAc = true 
				} if (itemHtml.includes("legendsmall.png")) {
					isItemLegend = true 
				} if (!itemHtml.includes("legendsmall.png") & !itemHtml.includes("acsmall.png")) {
					isItemNormal = true 
				}  
			
			
				if (itemHtml.includes("raresmall.png")) {
					skip = true // Always skip rare 
				}
				
			
				
			
				try {
					if (!skip) {
						
						var itemName = proc.lastChild.textContent
						
						for (var ax = 0; ax < wiki_exclude_suffixes["Excluded"].length; ax++) {
							itemName = itemName.replace(wiki_exclude_suffixes["Excluded"][ax],"")
						}
						
						var itemAmount= elementsA[x].nextSibling.data.replace("x","").replace(",","")
						var amount = parseInt(itemAmount)
						if (isNaN(amount)) {
							var amount = 1  
						}
						if (tabRet[itemName] !== undefined) {
							tabRet[itemName] += amount
						} else {
							tabRet[itemName] = amount
						}
					
						if (itemText in itemTable) {
							var tempCopy =  itemTable[itemText]
							tempCopy[1].push(itemName)
							tempCopy[1].push(amount)
							itemTable[itemText] = tempCopy 
						} else {
							itemTable[itemText] = [[isItemNormal,isItemAc,isItemLegend],[itemName,amount]]
						}
					}
				} 
				catch(err){
					try {
						if (!skip) {
							var itemName = proc.childNodes[0].textContent
							
							for (var ax = 0; ax < wiki_exclude_suffixes["Excluded"].length; ax++) {
								itemName = itemName.replace(wiki_exclude_suffixes["Excluded"][ax],"")
							}
							
							var itemAmount= elementsA[x].nextSibling.data.replace("x","").replace(",","")
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
								
								if (itemText in itemTable) {
									var tempCopy =  itemTable[itemText]
									tempCopy[1].push(itemName)
									tempCopy[1].push(amount)
									itemTable[itemText] = tempCopy 
								} else {
									itemTable[itemText] = [[isItemNormal,isItemAc,isItemLegend],[itemName,amount]]
								}
							}
						}
					} catch(err) {
					}
				}
					
			}
			
		}
	}

	return itemTable
	
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




function processAllMergeShopItems(tabAmount,Items) {
	var itemsFound = {}
	var Found = 0 
	
	for (var xr = 0; xr < tabAmount; xr++) { 
		var table = document.getElementById("wiki-tab-0-"+xr).getElementsByClassName("wiki-content-table")[0] 
		var x = processTable(table,Items)
		var Found = Found + x.length
		itemsFound = mergeObjects(itemsFound, x)
		
	}
	return [Found, itemsFound]
		
	
}





// Formats item : quantity 
function itemFormat(obj, filters, FilterNormal, FilterAc, FilterLegend) {
	  let x = 0 
	  let skip = false 
	  let newObj = {};
	  let currentFilter = [] 
	  let itemsCounted = 0 
	  for (let key in obj) {

	
		let itemList = obj[key][1];
			
		currentFilter = filters[x] 
		for (let i = 0; i < itemList.length; i += 2) {
		  
		 
		  skip = false 
		  if (FilterLegend == false & FilterAc == false & FilterNormal == true) {
				if (currentFilter[0] == false) {
					skip = true 
				} 
				if (currentFilter[2] == true | currentFilter[1] == true) {
					skip = true 
				}
			} else if (FilterLegend == false & FilterAc == true & FilterNormal == true) {
				if (currentFilter[1] == false | currentFilter[2] == true) {
					skip = true 
				} 
			} else if (FilterLegend == true & FilterAc == true & FilterNormal == true) {
			} else if (FilterLegend == true & FilterAc == false & FilterNormal == true) {
				if (!currentFilter[2] == true) {
					skip = true 
				} 
				if (currentFilter[2] == true & currentFilter[1] == true) {
					skip = true 
				}
			} else if (FilterLegend == false & FilterAc == true & FilterNormal == false) {
				if (!currentFilter[1] == true) {
					skip = true 
				} 
			} else if (FilterLegend == true & FilterAc == false & FilterNormal == false) {
				if (!currentFilter[2] == true) {
					skip = true 
				} 
			} else if (FilterLegend == true & FilterAc == true & FilterNormal == false) {
				if (currentFilter[1] == true & currentFilter[2] == true) {
			
				} else { skip = true }
			} 
			

			
			let item = itemList[i];
			let quantity = itemList[i+1];
			if (!skip) {
			  if (newObj[item]) {
				newObj[item] += quantity;
			  } else {
				newObj[item] = quantity;						
			  }
			  
			}
	
		  
		  
		   
		}
		if (!skip) {
			itemsCounted = itemsCounted + 1 
		}
		x = x + 1
	  } 

	  return [newObj, itemsCounted];
}

function itemBooleans(obj) {
    var result = [];
    for (var key in obj) {
        result.push(obj[key][0]);
    }
    return result;
}

function itemCheck(itemsObject, yourItems) {
	var newObject = {} 
	for (var key in Object.keys(itemsObject)) {
		var item = Object.keys(itemsObject)[key]
		if (yourItems.includes(translateUnidentified(item.trim().toLowerCase()))) {
			
		} else {
			newObject[item] = itemsObject[item] 
		}
	}
	
	return newObject
}

function DisplayCost(itemsObject, tabAmount, frame, yourItems, MFN, MFA, MFL) {
	var update = false 
	var element = document.getElementById("MergeTable")

	if (element == null) {
		var element = document.createElement("table");
		element.id = "MergeTable"
	} else {
		update = true 
		var element = document.getElementsByClassName("MergeContentTable")
	}
	var mergeshopAcquiredItems = document.getElementsByClassName("Acquired").length - document.getElementsByClassName("RescourceAcquired").length;
	
	var mergeshopItemsAmount = document.getElementsByTagName("tr").length - document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length;
	
	var tableHeader = `<div class='yui-content'><tbody><th>Item Needed</th><th>Amount</th><th>You Have</th><th>Left</th>`;
	
	var tableBody = "";
	
	itemsObject = itemCheck(itemsObject, yourItems) 
	
	var filters = itemBooleans(itemsObject)
	
	itemsObject = itemFormat(itemsObject,filters,MFN,MFA,MFL)[0]
	 
	newDict = {}
	tempDict = Object.entries(itemsObject).sort((a,b) => b[1] - a[1])
	

	tempDict.forEach(([key, value]) => { 
		newDict[key] = value 
	})	
	itemsObject = newDict
					
	Object.entries(itemsObject).forEach(([key, value]) => { 
		if (value !== "") {
			
			
			if (yourItems.includes(translateUnidentified(key.toLowerCase()))) {
				var accountAmount = parseInt(Type[yourItems.indexOf(translateUnidentified(key.toLowerCase()))][1])
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
				
				tableBody += `<tr><td style='text-decoration: line-through;'><a href="${itemHref}">${key}</a></td><td>${value}</td><td style="color:green;">${accountAmount}</td><td>${leftAmount}</td></tr>`
			}
			else {
				tableBody += `<tr><td ><a href="${itemHref}">${key}</a></td><td>${value}</td><td style='color:red;'>${accountAmount}</td><td>${leftAmount}</td></tr>`	
			}
			
		}
		
		
	});


	if (!update) {
		element.classList.add("wiki-content-table")
		element.classList.add("MergeContentTable")
		element.style = "position:relative;float:right;align:left;text-align: center;width:100%";
		element.innerHTML = tableHeader + tableBody;
	}
	else {
		for (var i = 0; i < element.length; i++) { 
			element[i].innerHTML = tableHeader + tableBody;
		}
	}

	if (!update) {
		frame.appendChild(element);
	}

	
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

function countAcquiredItems(Items, Filters, FilterNormal, FilterAc, FilterLegend) {
	var skip = false 
	var x = 0 
	var count = 0
	
	//download(JSON.stringify(mergeData[1]), "debug.txt", "plain/txt")
	
	Object.entries(mergeData[1]).forEach(([key, value]) => { 
		  
		  skip = false 
		  var currentFilter = Filters[x] 
		  if (FilterLegend == false & FilterAc == false & FilterNormal == true) {
				if (currentFilter[0] == false) {
					skip = true 
				} 
				if (currentFilter[2] == true | currentFilter[1] == true) {
					skip = true 
				}
			} else if (FilterLegend == false & FilterAc == true & FilterNormal == true) {
				if (currentFilter[1] == false | currentFilter[2] == true) {
					skip = true 
				} 
			} else if (FilterLegend == true & FilterAc == true & FilterNormal == true) {
			} else if (FilterLegend == true & FilterAc == false & FilterNormal == true) {
				if (!currentFilter[2] == true) {
					skip = true 
				} 
				if (currentFilter[2] == true & currentFilter[1] == true) {
					skip = true 
				}
			} else if (FilterLegend == false & FilterAc == true & FilterNormal == false) {
				if (!currentFilter[1] == true) {
					skip = true 
				} 
			} else if (FilterLegend == true & FilterAc == false & FilterNormal == false) {
				if (!currentFilter[2] == true) {
					skip = true 
				} 
			} else if (FilterLegend == true & FilterAc == true & FilterNormal == false) {
				if (currentFilter[1] == true & currentFilter[2] == true) {
			
				} else { skip = true }
			} 
		
		if (!skip) {
		
			if (Items.includes(translateUnidentified(key.trim().toLowerCase()))) {
				count = count + 1
		
			}
		}
		x = x + 1
	})

	return count 
}
function updateTitleList() {
	// 1. Get Title Elements 

	var TitleElements = document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li")
	// 1.1 get wiki table elements.
	
	for (var i = 0; i < TitleElements.length; i++) { 
	    var current = "wiki-tab-0-"+i
		
		
		var x = document.getElementById(current).getElementsByClassName("wiki-content-table")[2].getElementsByTagName("tr")
		
		var allNotHidden = false 
		for (var n = 1; n < x.length; n++) { 
			if (x[n].hidden == false) {
				allNotHidden = allNotHidden | true 
			} else {
				allNotHidden = allNotHidden | false 
			}
		}
		
		if (allNotHidden == false) {
			TitleElements[i].style = "display: none;"
		} else {
			TitleElements[i].style = ""
		}
	}
}

function updateCostMergeShop(Items, MFN, MFA, MFL) {
	
	chrome.storage.local.get({mergeFilterAc: []}, function(result){
		mergeFilterAc = result.mergeFilterAc;
		chrome.storage.local.get({mergeFilterNormal: []}, function(result){
			mergeFilterNormal = result.mergeFilterNormal;
			chrome.storage.local.get({mergeFilterLegend: []}, function(result){
				mergeFilterLegend = result.mergeFilterLegend;
		
				Frame = document.getElementsByClassName("CostMerge")[0]
				var tabAmount = document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length
				
			
				DisplayCost(mergeData[1], tabAmount, Frame, Items, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)	
				
				
	
				
				var filters = itemBooleans(mergeData[1])
				
				itemsObject = itemFormat(mergeData[1],filters,mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
				let mergeshopItemsAmount = Object.values(itemsObject)[1]
				let mergeshopAcquiredItems = countAcquiredItems(Items, filters, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
			
			
				updateTable(Frame, mergeshopItemsAmount, mergeshopAcquiredItems)
				
				
				updateTitleList()
				
			});
		});	
	});
	
	
	

}




function updateTable(Frame, mergeshopItemsAmount, mergeshopAcquiredItems) {
	let update = false 
	let tabAmount = document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length
	
	var Element = document.getElementById("MasterMergeTable")
	
	if (Element == null) {
		var Element = document.createElement("table")
		Element.id = "MasterMergeTable"
		Element.classList.add("MasterMergeTable");
		Element.classList.add("wiki-content-table");
	} else {
		update = true 
		var Element = document.getElementById("MasterMergeTable")
	}
	if (update) {
		var x = 0
		for (E in document.getElementsByClassName("MasterMergeTable")) {
			EL = document.getElementsByClassName("MasterMergeTable")[x]
			if (EL != undefined) {
				EL.style = "position:relative;align:left;width:100%;"
				EL.innerHTML = "<div class='yui-content'><table class=;wiki-content-table;><tbody><th>Items Available</th><th>Acquired</th><tr><td style='text-align:center'>"+mergeshopItemsAmount+"</td><td>"+mergeshopAcquiredItems+"</td></tbody></table></div>"
			}
			x = x + 1
			
		}
		for (P in Element.getElementsByClassName("progressBar")) {
			PL = Element.getElementsByClassName("progressBar")[P]
			var progressWidth = parseInt(100*mergeshopAcquiredItems/mergeshopItemsAmount)
			
			if (progressWidth != 0) {
				PL.innerHTML = `<br><div class="w3-dark-grey" style="text-align:center"><div class="w3-container w3-green w3-center" style="font-weight:800;width:${progressWidth}%">${progressWidth}%</div></div><br>`
			} else {
			PL.innerHTML = `<br><div style="font-weight:800;text-align:center" class="w3-dark-grey">0%</div><br>`
			}
		}
		
			
		
	} else {
		Element.style = "position:relative;align:left;width:100%;"
		Element.innerHTML = "<div class='yui-content'><table class=;wiki-content-table;><tbody><th>Items Available</th><th>Acquired</th><tr><td style='text-align:center'>"+mergeshopItemsAmount+"</td><td>"+mergeshopAcquiredItems+"</td></tbody></table></div>"
		
		if (!update) {
			var ProgressbarElement = document.createElement("div")
			ProgressbarElement.id = "progressBar"
			ProgressbarElement.classList.add("progressBar");
		} else {
			var ProgressbarElement = document.getElementById("progressBar")
		}
		
		var progressWidth = parseInt(100*mergeshopAcquiredItems/mergeshopItemsAmount)
		if (progressWidth != 0) {
	ProgressbarElement.innerHTML = `<br><div class="w3-dark-grey" style="text-align:center"><div class="w3-container w3-green w3-center" style="font-weight:800;width:${progressWidth}%">${progressWidth}%</div></div><br>`
		} else {
			ProgressbarElement.innerHTML = `<br><div style="font-weight:800;text-align:center" class="w3-dark-grey">0%</div><br>`
		}
	}

	if (!update) {
		Frame.prepend(ProgressbarElement)
		let x = Element.cloneNode(true)
		Frame.prepend(x)
		
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
	else {
		
	}
	
}


async function DisplayCostMergeShop(Items, MFN, MFA, MFL) {
	
	repairSpan()
	let tabAmount = document.getElementsByClassName("yui-nav")[0].getElementsByTagName("li").length
	let Frame = document.createElement("div") 
	Frame.className = "CostMerge"
	Frame.style = "display:inline-block;position:relative;float:right;"
	
	
	
	mergeData = processAllMergeShopItems(tabAmount,Items)
	
	DisplayCost(mergeData[1], tabAmount, Frame, Items, MFN, MFA, MFL)	
	
	
	var filters = itemBooleans(mergeData[1])


	itemsObject = itemFormat(mergeData[1],filters,mergeFilterNormal, mergeFilterAc, mergeFilterLegend)
	let mergeshopItemsAmount = Object.values(itemsObject)[1]
	let mergeshopAcquiredItems = countAcquiredItems(Items, filters, mergeFilterNormal, mergeFilterAc, mergeFilterLegend)

	
	updateTable(Frame, mergeshopItemsAmount, mergeshopAcquiredItems)
	
	
	updateTitleList()


}