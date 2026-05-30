// ProcessAccountItems.js - API METHOD (FAST!)

var json_data;
var _UndArray_0;
var _UndArray_1;

var accountDataReady = (async function() {
    try {
        var resp = await fetch(chrome.runtime.getURL("data/Unidentified_Translation.json"));
        json_data = await resp.json();
        _UndArray_0 = json_data["Names"];
        _UndArray_1 = json_data["Translation"];
        console.log("✅ Unidentified translation loaded");
    } catch(e) {
        console.error("❌ Failed to load translation:", e);
    }
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

function translateUnidentified(itemname) {
    if (!itemname) return itemname;
    if (itemname.toLowerCase().includes("unidentified")) {
        for (var x = 0; x < _UndArray_0.length; x++) {
            if (itemname == _UndArray_0[x]) {
                return _UndArray_1[x];
            }
        }
    }
    return itemname;
}

// ============================================================
// FETCH INVENTORY VIA API (FAST - 1 REQUEST)
// ============================================================
async function fetchInventoryData() {
    console.log("========== [AQW] FETCHING INVENTORY (API) ==========");
    
    let allItems = [];
    let skip = 0;
    const take = 300;
    let totalCount = 0;
    
    try {
        // First request to get total count and first batch
        const firstResponse = await fetch(
            `https://account.aq.com/myapi/inventory/InventoryData?skip=0&take=${take}&requireTotalCount=true&sort=[{"selector":"Added","desc":true}]&_=${Date.now()}`,
            {
                headers: {
                    "accept": "application/json, text/javascript, */*; q=0.01",
                    "x-requested-with": "XMLHttpRequest"
                },
                credentials: "include"
            }
        );
        
        const firstData = await firstResponse.json();
        totalCount = firstData.totalCount;
        allItems.push(...firstData.data);
        console.log(`✅ Page 1: ${firstData.data.length} items (total: ${totalCount})`);
        
        // Calculate remaining pages
        const remainingPages = Math.ceil((totalCount - take) / take);
        
        // Fetch remaining pages in parallel (faster!)
        const promises = [];
        for (let page = 1; page <= remainingPages; page++) {
            const newSkip = page * take;
            promises.push(
                fetch(
                    `https://account.aq.com/myapi/inventory/InventoryData?skip=${newSkip}&take=${take}&requireTotalCount=true&sort=[{"selector":"Added","desc":true}]&_=${Date.now() + page}`,
                    {
                        headers: {
                            "accept": "application/json, text/javascript, */*; q=0.01",
                            "x-requested-with": "XMLHttpRequest"
                        },
                        credentials: "include"
                    }
                ).then(r => r.json())
            );
        }
        
        const otherPages = await Promise.all(promises);
        for (const pageData of otherPages) {
            if (pageData.data && pageData.data.length > 0) {
                allItems.push(...pageData.data);
                console.log(`✅ Page ${Math.floor(allItems.length / take) + 1}: ${pageData.data.length} items`);
            }
        }
        
        console.log(`🎉 TOTAL: ${allItems.length} items fetched via API`);
        
        // Convert API response to our format
        const formattedItems = allItems.map(item => ({
            ItemName: item.Name || "",
            Quantity: item.Count || 1,
            Type: item.Type || "",
            Location: item.Bank === 1 ? "Bank" : "Inv",
            Currency: item.AC === 1 ? "AC" : "Gold",
            Category: item.Member === 1 ? "Member" : "Free"
        }));
        
        return formattedItems;
        
    } catch(e) {
        console.error("❌ API Error:", e);
        throw e;
    }
}

// ============================================================
// PROCESS ITEMS (Sama seperti sebelumnya)
// ============================================================
function ProcessAccountItems(itemsArray) {
    if (!itemsArray || !itemsArray.length) {
        console.warn("⚠️ [AQW] No items to process");
        return [[], [], [], [], []];
    }
    
    console.log("🔄 [AQW] Processing", itemsArray.length, "items...");
    
    var Items = [];
    var Where = [];
    var Type = [];
    var Buy = [];
    var Category = [];
    
    for (var i = 0; i < itemsArray.length; i++) {
        var item = itemsArray[i];
        var rawName = item.ItemName || "";
        var itemType = item.Type || "";
        var itemWhere = item.Location || "Inv";
        var itemCurrency = item.Currency || "Gold";
        var itemCategory = item.Category || "Free";
        var quantity = item.Quantity || 1;
        
        var isStackable = (itemType === "Item" || itemType === "Resource" ||
                           itemType === "Quest Item" || itemType === "Wall Item" ||
                           itemType === "Floor Item");
        
        if (!rawName) continue;
        
        if (isStackable && rawName.includes(" x ")) {
            var parts = rawName.split(" x ");
            quantity = parseInt(parts[parts.length - 1]) || 1;
            var nameOnly = parts.slice(0, -1).join(" x ");
            Items.push(normalizeInventoryKey(translateUnidentified(nameOnly)));
            Type.push([itemType, quantity]);
        } else if (isStackable) {
            Items.push(normalizeInventoryKey(translateUnidentified(rawName)));
            Type.push([itemType, quantity]);
        } else {
            Items.push(normalizeInventoryKey(translateUnidentified(rawName)));
            Type.push(itemType);
        }
        
        Where.push(itemWhere);
        Buy.push(itemCurrency);
        Category.push(itemCategory);
    }
    
    console.log(`✅ [AQW] Processed ${Items.length} items`);
    if (Items.length > 0) {
        console.log("📋 Sample:", Items[0], "| Type:", Type[0], "| Where:", Where[0]);
    }
    return [Items, Where, Type, Buy, Category];
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        fetchInventoryData, 
        ProcessAccountItems,
        accountDataReady,
        translateUnidentified,
        normalizeInventoryKey
    };
}
