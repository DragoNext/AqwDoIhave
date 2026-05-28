// ProcessAccountItems.js - FINAL (Scrape from DOM table)

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
// WAIT FOR TABLE TO BE POPULATED
// ============================================================
async function waitForTableData() {
    console.log("⏳ [AQW] Waiting for inventory table to populate...");
    
    for (let i = 0; i < 60; i++) {
        // Cari baris data di tabel inventory
        const rows = document.querySelectorAll('#dataGridContainer .dx-data-row');
        
        if (rows.length > 0) {
            // Pastikan baris pertama punya data (bukan placeholder)
            const firstRowCells = rows[0].querySelectorAll('td');
            if (firstRowCells.length >= 1 && firstRowCells[0].innerText.trim() !== "") {
                console.log(`✅ [AQW] Found ${rows.length} inventory rows`);
                return rows;
            }
        }
        
        await new Promise(r => setTimeout(r, 500));
    }
    
    throw new Error("❌ [AQW] Inventory table not found or empty");
}

// ============================================================
// SCRAPE INVENTORY FROM DOM TABLE
// ============================================================
async function fetchInventoryData() {
    console.log("========== [AQW] FETCHING INVENTORY ==========");
    
    // Wait for table to be populated
    const rows = await waitForTableData();
    
    const items = [];
    
    // Map column indices based on table headers
    // From HTML: Inventory Item, Quantity, Type, Bank, AC, Member, Date Added
    let colIndex = {
        name: 0,
        quantity: 1,
        type: 2,
        bank: 3,    // checkbox
        ac: 4,      // checkbox
        member: 5,  // checkbox
        date: 6
    };
    
    for (let row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) continue;
        
        const name = cells[colIndex.name]?.innerText?.trim() || "";
        const quantity = parseInt(cells[colIndex.quantity]?.innerText?.trim()) || 1;
        const type = cells[colIndex.type]?.innerText?.trim() || "";
        
        // Check checkbox status (Bank, AC, Member)
        const bankCheckbox = cells[colIndex.bank]?.querySelector('.dx-checkbox-checked');
        const acCheckbox = cells[colIndex.ac]?.querySelector('.dx-checkbox-checked');
        const memberCheckbox = cells[colIndex.member]?.querySelector('.dx-checkbox-checked');
        
        const itemWhere = bankCheckbox ? "Bank" : "Inv";
        const itemCurrency = acCheckbox ? "AC" : "Gold";
        const itemCategory = memberCheckbox ? "Member" : "Free";
        
        if (!name) continue;
        
        items.push({
            ItemName: name,
            Quantity: quantity,
            Type: type,
            Location: itemWhere,
            Currency: itemCurrency,
            Category: itemCategory
        });
    }
    
    console.log(`✅ [AQW] Scraped ${items.length} items from DOM`);
    return items;
}

// ============================================================
// PROCESS ITEMS
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
        
        // Handle stackable items with " x " in name
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
