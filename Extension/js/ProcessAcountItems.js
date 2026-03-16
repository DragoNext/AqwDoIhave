// ProcessAccountItems.js

var json_data;
var _UndArray_0;
var _UndArray_1;

var accountDataReady = (async function() {
	var resp = await fetch(chrome.runtime.getURL("data/Unidentified_Translation.json"));
	json_data = await resp.json();
	_UndArray_0 = json_data["Names"];
	_UndArray_1 = json_data["Translation"];
})();

function normalizeInventoryKey(itemname) {
	return String(itemname || "")
		.normalize("NFKC")
		.replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'")
		.replace(/[\u2013\u2014\u2212]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}


// Translates unidentified items
function translateUnidentified(itemname) {
	if (itemname.includes("unidentified")) {
		for (var x = 0; x < _UndArray_0.length; x++) {
			if (itemname == _UndArray_0[x]) {
				return _UndArray_1[x];
			}
		}
	}
	return itemname;
}

// Fetches inventory data from the new JSON API endpoint
async function fetchInventoryData() {
	var resp = await fetch("/AQW/InventoryData?_=" + Date.now(), {
		headers: {
			"accept": "application/json, text/javascript, */*; q=0.01",
			"x-requested-with": "XMLHttpRequest"
		}
	});
	if (!resp.ok) throw new Error("Failed to fetch inventory: " + resp.status);
	return resp.json();
}

// Processes items from account JSON API
// JSON format: {"data": [["Name xN", "Type", "Code", "Inv/Bank", "Gold/AC", "Free/Member", "Date"], ...]}
function ProcessAccountItems(jsonData) {
	var Items = []
	var Where = []
	var Type = []
	var Buy = []
	var Category = []

	var rows = jsonData.data;

	for (var i = 0; i < rows.length; i++) {
		var row = rows[i];
		var rawName = row[0].replace("\u0027", "'");
		var itemType = row[1];
		var itemWhere = row[3];   // "Inv" or "Bank"
		var itemCurrency = row[4]; // "Gold" or "AC"
		var itemCategory = row[5]; // "Free" or "Member"

		var isStackable = (itemType == "Item" || itemType == "Resource" ||
		                   itemType == "Quest Item" || itemType == "Wall Item" ||
		                   itemType == "Floor Item");

		if (isStackable && rawName.includes(" x")) {
			// Stackable with count — e.g. "Vigil x996"
			var parts = rawName.split(" x");
			var amount = parts[parts.length - 1];
			var nameOnly = parts.slice(0, -1).join(" x"); // Handle names that contain " x"
			Items.push(normalizeInventoryKey(translateUnidentified(nameOnly)));
			Type.push([itemType, amount]);
		} else if (isStackable) {
			// Stackable without count — amount is 1
			Items.push(normalizeInventoryKey(translateUnidentified(rawName)));
			Type.push([itemType, 1]);
		} else {
			// Non-stackable (Armor, Sword, Class, etc.)
			Items.push(normalizeInventoryKey(translateUnidentified(rawName)));
			Type.push(itemType);
		}

		Where.push(itemWhere);
		Buy.push(itemCurrency);
		Category.push(itemCategory);
	}

	return [Items, Where, Type, Buy, Category];
}
