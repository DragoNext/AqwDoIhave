var items_json = typeof window !== "undefined" && typeof window.items_json !== "undefined" ? window.items_json : null;
var wiki_exclude_suffixes = typeof window !== "undefined" && typeof window.wiki_exclude_suffixes !== "undefined" ? window.wiki_exclude_suffixes : null;
var merge_shops_json = null;
var quests_json = null;
var locations_json = null;

if (typeof drop_icon === "undefined") {
	window.drop_icon = chrome.runtime.getURL("images/monster_drop.png");
	window.quest_icon = chrome.runtime.getURL("images/quest_icon.png");
	window.mergeshop_icon = chrome.runtime.getURL("images/mergeshop_icon.png");
}

var ITEMS_PER_PAGE = 50;
var GROUPS_PER_PAGE = 20;
var activeTab = "todrop";
var tabState = {
	todrop: { page: 0, items: [] },
	inbank: { page: 0, items: [] },
	tomerge: { page: 0, groups: [] },
	toquest: { page: 0, groups: [] },
	completed: { page: 0, sections: [] }
};
var searchTerm = "";
var _accountItems = [];
var _accountWhere = [];
var _normalizedLookup = null;
var _slugLookup = null;
var _imageCache = new Map();
var EMPTY_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
var MISSING_IMAGE_SRC = "data:image/svg+xml;utf8," + encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'>"
	+ "<rect width='320' height='320' fill='#1f1c28'/>"
	+ "<rect x='24' y='24' width='272' height='272' fill='none' stroke='#6f5a67' stroke-width='2' stroke-dasharray='10 8'/>"
	+ "<text x='160' y='148' text-anchor='middle' fill='#d9c7b6' font-family='Arial, sans-serif' font-size='22'>NO IMAGE</text>"
	+ "<text x='160' y='182' text-anchor='middle' fill='#9f8898' font-family='Arial, sans-serif' font-size='14'>AQW Wiki art unavailable</text>"
	+ "</svg>"
);
var GRID_SIZE_CONFIG = {
	compact: { item: "150px", group: "190px" },
	medium: { item: "170px", group: "220px" },
	large: { item: "210px", group: "270px" }
};

function preloadImage(src) {
	return new Promise(function(resolve) {
		if (!src) {
			resolve("");
			return;
		}
		var testImg = new Image();
		testImg.onload = function() {
			resolve(src);
		};
		testImg.onerror = function() {
			resolve("");
		};
		testImg.src = src;
	});
}
var _searchTimer = null;

function fetchJson(url) {
	return fetch(url).then(function(resp) {
		if (!resp.ok) {
			throw new Error("Failed to fetch " + url + ": " + resp.status);
		}
		return resp.json();
	});
}

var toFarmDataReady = Promise.resolve();

if (window.location.href.includes("tofarm.html")) {
	toFarmDataReady = Promise.all([
		items_json ? Promise.resolve(items_json) : fetchJson(chrome.runtime.getURL("data/WikiItems.json")),
		wiki_exclude_suffixes ? Promise.resolve(wiki_exclude_suffixes) : fetchJson(chrome.runtime.getURL("data/wiki_exclude_suffixes.json")),
		fetchJson(chrome.runtime.getURL("data/merge_shops.json")),
		fetchJson(chrome.runtime.getURL("data/quests.json")),
		fetchJson(chrome.runtime.getURL("data/locations.json"))
	]).then(function(results) {
		items_json = results[0];
		wiki_exclude_suffixes = results[1];
		merge_shops_json = results[2];
		quests_json = results[3];
		locations_json = results[4];
	});
} else if (typeof dataReady !== "undefined") {
	toFarmDataReady = dataReady.then(function() {
		items_json = items_json || window.items_json;
		wiki_exclude_suffixes = wiki_exclude_suffixes || window.wiki_exclude_suffixes;
	});
}

function getNormalizedLookup() {
	if (_normalizedLookup) {
		return _normalizedLookup;
	}

	var lookup = new Map();
	Object.entries(items_json || {}).forEach(function(entry) {
		var key = entry[0];
		var data = entry[1];
		lookup.set(normalize(key), [key, data]);
	});
	_normalizedLookup = lookup;
	return lookup;
}

function getSlugLookup() {
	if (_slugLookup) {
		return _slugLookup;
	}

	var lookup = new Map();
	Object.entries(items_json || {}).forEach(function(entry) {
		var key = entry[0];
		var data = entry[1];
		var slug = normalizeSlug(data[0]);
		if (slug) {
			lookup.set(slug.toLowerCase(), [key, data]);
		}
	});
	_slugLookup = lookup;
	return lookup;
}

function normalizeSlug(slug) {
	if (!slug) {
		return "";
	}
	return slug.startsWith("/") ? slug : "/" + slug;
}

function normalize(name) {
	var value = String(name || "").toLowerCase();
	var excluded = (wiki_exclude_suffixes && wiki_exclude_suffixes["Excluded"]) || [];
	for (var i = 0; i < excluded.length; i++) {
		value = value.replace(String(excluded[i]).toLowerCase(), "");
	}
	return value.trim();
}

function isOwned(name) {
	return _accountItems.includes(normalize(name));
}

function isMiscItem(name, slug) {
	var normalized = normalize(name);
	var byName = getNormalizedLookup().get(normalized);
	var bySlug = getSlugLookup().get(normalizeSlug(slug).toLowerCase());
	var found = byName || bySlug;
	if (!found) {
		return false;
	}
	var category = found[1][found[1].length - 1];
	return category === "misc-items" || category === "necklaces";
}

function getFilters() {
	return {
		normal: document.getElementById("Filter_NormalItem").checked,
		ac: document.getElementById("Filter_AcItem").checked,
		legend: document.getElementById("Filter_LegendItem").checked,
		seasonal: document.getElementById("Filter_SeasonalItem").checked
	};
}

function getInBankFilters() {
	return {
		rare: document.getElementById("Filter_RareItem").checked,
		pseudo_rare: document.getElementById("Filter_PseudoRareItem").checked
	};
}

function isRareTaggedEntity(entity) {
	if (!entity) {
		return false;
	}
	if (entity.rare === true || entity.pseudo_rare === true) {
		return true;
	}
	var tags = entity.tags || [];
	return tags.includes("rare") || tags.includes("pseudo-rare");
}

function getItemTags(item_details, options) {
	var tags = [];
	var opts = options || {};
	if (!item_details) {
		return tags;
	}
	if (readFlag(item_details, "AC")) {
		tags.push("ac");
	}
	if (readFlag(item_details, "Legend")) {
		tags.push("legend");
	}
	if (readFlag(item_details, "Seasonal")) {
		tags.push("seasonal");
	}
	if (!readFlag(item_details, "AC") && !readFlag(item_details, "Legend")) {
		tags.push("normal");
	}
	if (opts.includeRarity) {
		if (readFlag(item_details, "Rare")) {
			tags.push("rare");
		}
		if (readFlag(item_details, "Pseudo Rare")) {
			tags.push("pseudo_rare");
		}
	}
	return tags;
}

function passesTagFilter(tags, filters) {
	var set = new Set(tags || []);
	if (set.has("normal") && !filters.normal) {
		return false;
	}
	if (set.has("ac") && !filters.ac) {
		return false;
	}
	if (set.has("legend") && !filters.legend) {
		return false;
	}
	if (set.has("seasonal") && !filters.seasonal) {
		return false;
	}
	return true;
}

function passesInBankRarityFilter(tags, filters) {
	var set = new Set(tags || []);
	var wantsRare = !!filters.rare;
	var wantsPseudoRare = !!filters.pseudo_rare;
	if (!wantsRare && !wantsPseudoRare) {
		return true;
	}
	return (wantsRare && set.has("rare")) || (wantsPseudoRare && set.has("pseudo_rare"));
}

function updateStats(left, right) {
	document.getElementById("stats-left").textContent = left;
	document.getElementById("stats-right").textContent = right;
}

function applyGridSize(size) {
	var resolved = GRID_SIZE_CONFIG[size] ? size : "medium";
	var config = GRID_SIZE_CONFIG[resolved];
	document.documentElement.style.setProperty("--item-grid-min", config.item);
	document.documentElement.style.setProperty("--group-grid-min", config.group);
	var select = document.getElementById("grid-size-select");
	if (select) {
		select.value = resolved;
	}
	return resolved;
}

function readDetail(item_details, label) {
	for (var i = 1; i < item_details.length; i++) {
		var row = item_details[i];
		if (Array.isArray(row) && row[0] === label) {
			return row[1];
		}
	}
	return undefined;
}

function readFlag(item_details, label) {
	return readDetail(item_details, label) === true;
}

function isRareItemDetails(item_details) {
	return readFlag(item_details, "Rare") || readFlag(item_details, "Pseudo Rare");
}

function hasRareLikeTag(tags) {
	var list = tags || [];
	return list.includes("rare") || list.includes("pseudo-rare") || list.includes("pseudo_rare");
}

function isCharacterPageBadge(name, slug) {
	var itemName = String(name || "");
	var itemSlug = String(slug || "").toLowerCase();
	return itemName.includes("Character Page Badge") || itemSlug.includes("/charpage:") || itemSlug.includes("charpage:");
}

function normalizeSourceSlug(value) {
	return normalizeSlug(value || "").replace(/^\/+$/, "");
}

function wikiUrl(slug) {
	if (!slug) {
		return "http://aqwwiki.wikidot.com";
	}
	if (slug.startsWith("http://") || slug.startsWith("https://")) {
		return slug;
	}
	return "http://aqwwiki.wikidot.com" + normalizeSlug(slug);
}

function matchSearch(parts) {
	if (!searchTerm) {
		return true;
	}
	var hay = parts.filter(Boolean).join(" ").toLowerCase();
	return hay.includes(searchTerm);
}

function getLocationObjectByName(name) {
	var target = String(name || "").toLowerCase().trim();
	if (!target) {
		return null;
	}
	var entries = Object.values(locations_json || {});
	for (var i = 0; i < entries.length; i++) {
		if (String(entries[i].name || "").toLowerCase() === target) {
			return entries[i];
		}
	}
	return null;
}

function normalizeLocationKey(name) {
	return String(name || "")
		.toLowerCase()
		.replace(/\s*\([^)]*\)\s*/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function lookupJoinCmd(locName, npcName, locSlug) {
	var entries = Object.values(locations_json || {});
	var locTarget = String(locName || "").toLowerCase().trim();
	var npcTarget = String(npcName || "").toLowerCase().trim();
	var locTargetKey = normalizeLocationKey(locName);
	var npcTargetKey = normalizeLocationKey(npcName);
	var slugTarget = normalizeSlug(locSlug).toLowerCase();

	for (var i = 0; i < entries.length; i++) {
		var entry = entries[i];
		var entryName = String(entry.name || "").toLowerCase();
		var entryNameKey = normalizeLocationKey(entry.name || "");
		var entrySlug = normalizeSlug(entry.slug || "").toLowerCase();
		if (
			(locTarget && entryName === locTarget) ||
			(npcTarget && entryName === npcTarget) ||
			(locTargetKey && entryNameKey === locTargetKey) ||
			(npcTargetKey && entryNameKey === npcTargetKey) ||
			(slugTarget && entrySlug === slugTarget)
		) {
			return entry.join_cmd || "";
		}
	}

	for (var j = 0; j < entries.length; j++) {
		var location = entries[j];
		var npcs = location.npcs || [];
		for (var x = 0; x < npcs.length; x++) {
			var currentNpc = String(npcs[x].name || "").toLowerCase();
			var currentNpcKey = normalizeLocationKey(npcs[x].name || "");
			if (
				(locTarget && currentNpc === locTarget) ||
				(npcTarget && currentNpc === npcTarget) ||
				(locTargetKey && currentNpcKey === locTargetKey) ||
				(npcTargetKey && currentNpcKey === npcTargetKey)
			) {
				return location.join_cmd || "";
			}
		}
	}

	return "";
}

function escapeHtml(value) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function joinCmdHtml(locName, npcName, locSlug) {
	var cmd = lookupJoinCmd(locName, npcName, locSlug);
	if (!cmd) {
		return "";
	}
	return "<div class='join-cmd'><code>" + escapeHtml(cmd) + "</code><button class='copy-icon' data-copy-join='" + escapeHtml(cmd) + "' type='button'>Copy</button></div>";
}

function copyJoinCmd(element, cmd) {
	if (!cmd || !navigator.clipboard) {
		return;
	}
	navigator.clipboard.writeText(cmd).then(function() {
		element.classList.add("copied");
		element.textContent = "Copied";
		setTimeout(function() {
			element.classList.remove("copied");
			element.textContent = "Copy";
		}, 900);
	});
}

function sourceIconForType(sourceType) {
	if (sourceType === "Drop") {
		return drop_icon;
	}
	if (sourceType === "Merge") {
		return mergeshop_icon;
	}
	if (sourceType === "Quest") {
		return quest_icon;
	}
	return "";
}

function tagChipsHtml(tags) {
	return (tags || []).map(function(tag) {
		if (!tag || String(tag).startsWith("_")) {
			return "";
		}
		if (tag === "ac") {
			return "<span class='planner-chip'><img src='https://aqwwiki.wdfiles.com/local--files/image-tags/aclarge.png' alt='AC'>AC</span>";
		}
		if (tag === "legend") {
			return "<span class='planner-chip'><img src='https://aqwwiki.wdfiles.com/local--files/image-tags/legendlarge.png' alt='Legend'>Legend</span>";
		}
		if (tag === "seasonal") {
			return "<span class='planner-chip'><img src='https://aqwwiki.wdfiles.com/local--files/image-tags/seasonallarge.png' alt='Seasonal'>Seasonal</span>";
		}
		if (tag === "normal") {
			return "<span class='planner-chip'>Normal</span>";
		}
		return "<span class='planner-chip'>" + escapeHtml(tag) + "</span>";
	}).join("");
}

function tagOverlayHtml(tags) {
	return (tags || []).map(function(tag) {
		if (tag === "ac") {
			return "<img class='card-tag-icon' src='https://aqwwiki.wdfiles.com/local--files/image-tags/aclarge.png' alt='AC' title='AC'>";
		}
		if (tag === "legend") {
			return "<img class='card-tag-icon' src='https://aqwwiki.wdfiles.com/local--files/image-tags/legendlarge.png' alt='Legend' title='Legend'>";
		}
		if (tag === "seasonal") {
			return "<img class='card-tag-icon' src='https://aqwwiki.wdfiles.com/local--files/image-tags/seasonallarge.png' alt='Seasonal' title='Seasonal'>";
		}
		if (tag === "normal") {
			return "<img class='card-tag-icon' src='http://aqwwiki.wdfiles.com/local--files/image-tags/Sword_Table.png' alt='Normal' title='Normal'>";
		}
		if (tag === "rare") {
			return "<img class='card-tag-icon' src='https://aqwwiki.wdfiles.com/local--files/image-tags/rarelarge.png' alt='Rare' title='Rare'>";
		}
		if (tag === "pseudo_rare") {
			return "<img class='card-tag-icon' src='https://aqwwiki.wdfiles.com/local--files/image-tags/pseudolarge.png' alt='Pseudo Rare' title='Pseudo Rare'>";
		}
		return "";
	}).join("");
}

function badgeClass(badge) {
	if (badge === "Bank") {
		return "bank";
	}
	if (badge === "Owned") {
		return "owned";
	}
		if (badge === "Needed" || badge === "To Acquire") {
			return "needed";
		}
	return "";
}

function add_to_grid(container, item_name, item_details, badge) {
	var tags = getItemTags(item_details);
	var price = readDetail(item_details, "Price") || [];
	var sourceLabel = typeof price[1] === "string" ? price[1] : "";
	var sourceSlug = typeof price[2] === "string" ? price[2] : "";
	var card = document.createElement("div");
	card.className = "item-card";
	card.dataset.itemName = item_name;
	card.dataset.slug = normalizeSlug(item_details[0]);
	card.innerHTML = ""
		+ "<div class='card-image-wrap'>"
		+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrl(item_details[0])) + "' alt='" + escapeHtml(item_name) + "'>"
		+ "<div class='card-tag-stack'>" + tagOverlayHtml(tags) + "</div>"
		+ "</div>"
		+ "<div class='card-body'>"
		+ "<div class='card-name'>" + escapeHtml(item_name) + "</div>"
		+ (sourceLabel ? "<div class='planner-chip-row' style='margin-top:8px;'>" + (sourceSlug ? "<a class='planner-chip source-chip' href='" + escapeHtml(wikiUrl(sourceSlug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(sourceLabel) + "</a>" : "<span class='planner-chip source-chip'>" + escapeHtml(sourceLabel) + "</span>") + "</div>" : "")
		+ "</div>";
	card.addEventListener("click", function() {
		openItemModal(item_name, item_details);
	});
	card.querySelectorAll("a").forEach(function(link) {
		link.addEventListener("click", function(event) {
			event.stopPropagation();
		});
	});
	container.appendChild(card);
}

function add_simple_card(container, name, slug, tags, owned) {
	var itemData = getSlugLookup().get(normalizeSlug(slug).toLowerCase());
	var badge = owned ? owned : "Owned";
	var card = document.createElement("div");
	card.className = "item-card";
	card.dataset.itemName = name;
	card.dataset.slug = normalizeSlug(slug);
	card.innerHTML = ""
		+ "<span class='card-badge " + badgeClass(badge) + "'>" + escapeHtml(badge) + "</span>"
		+ "<div class='card-image-wrap'>"
		+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrl(slug)) + "' alt='" + escapeHtml(name) + "'>"
		+ "<div class='card-tag-stack'>" + tagOverlayHtml(tags || []) + "</div>"
		+ "</div>"
		+ "<div class='card-body'>"
		+ "<div class='card-name'>" + escapeHtml(name) + "</div>"
		+ "</div>";
	card.addEventListener("click", function() {
		if (itemData) {
			openItemModal(itemData[0], itemData[1]);
		}
	});
	container.appendChild(card);
}

function renderFlatPage(tabName, page) {
	var state = tabState[tabName];
	var list = state.items || [];
	var start = page * ITEMS_PER_PAGE;
	var end = Math.min(start + ITEMS_PER_PAGE, list.length);
	var gridId = tabName === "todrop" ? "todrop-grid" : "inbank-grid";
	var grid = document.getElementById(gridId);
	grid.innerHTML = "";

	if (!list.length) {
		grid.innerHTML = "<div class='empty-state'>No items match the current filters.</div>";
		updateFlatPagination(tabName);
		return;
	}

	for (var i = start; i < end; i++) {
		var item = list[i];
		if (tabName === "todrop") {
			add_to_grid(grid, item.name, item.details, "To Acquire");
		} else {
			add_simple_card(grid, item.name, item.slug, item.tags, item.badge);
		}
	}

	updateFlatPagination(tabName);
	loadCardImages();
}

function updateFlatPagination(tabName) {
	var state = tabState[tabName];
	var totalPages = Math.max(1, Math.ceil((state.items || []).length / ITEMS_PER_PAGE));
	var container = document.getElementById(tabName === "todrop" ? "todrop-pagination" : "inbank-pagination");
	var current = state.page + 1;
	container.innerHTML = ""
		+ "<button type='button' data-page-tab='" + tabName + "' data-page-dir='prev' " + (current <= 1 ? "disabled" : "") + ">Prev</button>"
		+ "<span class='page-info'>Page " + current + " / " + totalPages + " (" + (state.items || []).length + " items)</span>"
		+ "<button type='button' data-page-tab='" + tabName + "' data-page-dir='next' " + (current >= totalPages ? "disabled" : "") + ">Next</button>";
}

function renderGroupPage(tabName, page, renderGroupFn) {
	var state = tabState[tabName];
	var list = state.groups || [];
	var start = page * GROUPS_PER_PAGE;
	var end = Math.min(start + GROUPS_PER_PAGE, list.length);
	var wrap = document.getElementById(tabName === "tomerge" ? "tomerge-wrap" : "toquest-wrap");
	wrap.innerHTML = "";

	if (!list.length) {
		wrap.innerHTML = "<div class='empty-state'>No groups match the current filters.</div>";
		updateGroupPagination(tabName);
		return;
	}

	for (var i = start; i < end; i++) {
		renderGroupFn(wrap, list[i]);
	}

	updateGroupPagination(tabName);
	loadCardImages();
}

function updateGroupPagination(tabName) {
	var state = tabState[tabName];
	var totalPages = Math.max(1, Math.ceil((state.groups || []).length / GROUPS_PER_PAGE));
	var current = state.page + 1;
	var container = document.getElementById(tabName === "tomerge" ? "tomerge-pagination" : "toquest-pagination");
	container.innerHTML = ""
		+ "<button type='button' data-page-tab='" + tabName + "' data-page-dir='prev' " + (current <= 1 ? "disabled" : "") + ">Prev</button>"
		+ "<span class='page-info'>Page " + current + " / " + totalPages + " (" + (state.groups || []).length + " groups)</span>"
		+ "<button type='button' data-page-tab='" + tabName + "' data-page-dir='next' " + (current >= totalPages ? "disabled" : "") + ">Next</button>";
}

function sortByName(a, b) {
	return a.name.localeCompare(b.name);
}

function flattenShopItems(shop) {
	var results = [];
	(shop.tabs || []).forEach(function(tab) {
		(tab.items || []).forEach(function(item) {
			results.push(item);
		});
	});
	return results;
}

function makeProgress(ownedCount, totalCount) {
	if (!totalCount) {
		return { pct: 0, text: "0 / 0" };
	}
	var pct = Math.round((ownedCount / totalCount) * 100);
	return {
		pct: pct,
		text: ownedCount + " / " + totalCount + " (" + pct + "%)"
	};
}

function buildSummaryPie(title, ownedCount, totalCount, accentClass, secondaryText) {
	var safeTotal = totalCount || 0;
	var pct = safeTotal ? Math.round((ownedCount / safeTotal) * 100) : 0;
	var remainingCount = Math.max(safeTotal - ownedCount, 0);
	var secondary = secondaryText || (remainingCount + " remaining");
	return ""
		+ "<div class='completed-summary-card'>"
		+ "<div class='completed-summary-title'>" + escapeHtml(title) + "</div>"
		+ "<div class='completed-summary-main'>"
		+ "<div class='summary-pie " + escapeHtml(accentClass || "") + "' style='--pie-pct:" + pct + "%;'>"
		+ "<div class='summary-pie-center'>" + pct + "%</div>"
		+ "</div>"
		+ "<div class='completed-summary-copy'>"
		+ "<div class='completed-summary-primary'>" + escapeHtml(ownedCount + " / " + safeTotal + " owned") + "</div>"
		+ "<div class='completed-summary-secondary'>" + escapeHtml(secondary) + "</div>"
		+ "</div>"
		+ "</div>"
		+ "</div>";
}

function renderToDrop() {
	var filters = getFilters();
	var found = [];

	Object.entries(items_json || {}).forEach(function(entry) {
		var item_name = entry[0];
		var item_details = entry[1];
		var price = readDetail(item_details, "Price") || [];
		var sourceType = price[0];

		if (sourceType !== "Drop") {
			return;
		}
		if (isRareItemDetails(item_details)) {
			return;
		}
		if (isMiscItem(item_name, item_details[0])) {
			return;
		}
		if (isOwned(item_name)) {
			return;
		}
		if (!passesTagFilter(getItemTags(item_details), filters)) {
			return;
		}
		if (!matchSearch([item_name, price[1], price[2], JSON.stringify(readDetail(item_details, "Location") || [])])) {
			return;
		}

		found.push({ name: item_name, details: item_details });
	});

	found.sort(sortByName);
	tabState.todrop.items = found;
	updateStats("Loaded Account Items: " + _accountItems.length, "Visible Results: " + found.length);
	renderFlatPage("todrop", tabState.todrop.page);
}

function renderInBank() {
	var filters = getFilters();
	var rarityFilters = getInBankFilters();
	var locationFilter = document.getElementById("location-filter").value;
	var found = [];

	for (var i = 0; i < _accountItems.length; i++) {
		var normalized = _accountItems[i];
		var result = getNormalizedLookup().get(normalized);
		if (!result) {
			continue;
		}
		var name = result[0];
		var details = result[1];
		var where = _accountWhere[i] || "";
		var tags = getItemTags(details, { includeRarity: true });
		if (!passesTagFilter(tags, filters)) {
			continue;
		}
		if (!passesInBankRarityFilter(tags, rarityFilters)) {
			continue;
		}
		if (locationFilter !== "all" && where !== locationFilter) {
			continue;
		}
		if (!matchSearch([name, where, details[0]])) {
			continue;
		}

		found.push({
			name: name,
			slug: details[0],
			tags: tags,
			where: where,
			badge: where === "Bank" ? "In Bank" : "In Inv"
		});
	}

	found.sort(function(a, b) {
		if (a.where === b.where) {
			return a.name.localeCompare(b.name);
		}
		if (a.where === "Inv") {
			return -1;
		}
		if (b.where === "Inv") {
			return 1;
		}
		return a.name.localeCompare(b.name);
	});

	tabState.inbank.items = found;
	updateStats("Loaded Account Items: " + _accountItems.length, "Visible Results: " + found.length);
	renderFlatPage("inbank", tabState.inbank.page);
}

function renderMergeGroup(wrap, shop) {
	var progress = makeProgress(shop.owned.length, shop.total);
	var neededHtml = shop.needed.map(function(item) {
		var ingredients = (item.ingredients || []).map(function(ing) {
			var label = ing.name + " x" + ing.qty;
			if (!ing.slug) {
				return "<span class='planner-chip source-chip'>" + escapeHtml(label) + "</span>";
			}
			return "<a class='planner-chip source-chip' href='" + escapeHtml(wikiUrl(ing.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(label) + "</a>";
		}).join("");
		return ""
			+ "<div class='item-card' data-item-name='" + escapeHtml(item.name) + "' data-slug='" + escapeHtml(normalizeSlug(item.slug)) + "'>"
			+ "<span class='card-badge needed'>To Acquire</span>"
			+ "<div class='card-image-wrap'>"
			+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrl(item.slug)) + "' alt='" + escapeHtml(item.name) + "'>"
			+ "<div class='card-tag-stack'>" + tagOverlayHtml(item.tags) + "</div>"
			+ "</div>"
			+ "<div class='card-body'>"
			+ "<div class='card-name'>" + escapeHtml(item.name) + "</div>"
			+ (ingredients ? "<div class='planner-chip-row' style='margin-top:8px;'>" + ingredients + "</div>" : "")
			+ "</div></div>";
	}).join("");

	var ownedHtml = shop.owned.map(function(item) {
		return ""
			+ "<div class='item-card' data-item-name='" + escapeHtml(item.name) + "' data-slug='" + escapeHtml(normalizeSlug(item.slug)) + "'>"
			+ "<span class='card-badge owned'>Owned</span>"
			+ "<div class='card-image-wrap'>"
			+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrl(item.slug)) + "' alt='" + escapeHtml(item.name) + "'>"
			+ "<div class='card-tag-stack'>" + tagOverlayHtml(item.tags) + "</div>"
			+ "</div>"
			+ "<div class='card-body'><div class='card-name'>" + escapeHtml(item.name) + "</div></div>"
			+ "</div>";
	}).join("");

	var group = document.createElement("div");
	group.className = "group-card";
	group.innerHTML = ""
		+ "<div class='group-header'>"
		+ "<div>"
		+ "<div class='group-title'><a href='" + escapeHtml(wikiUrl(shop.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(shop.name) + "</a></div>"
		+ "<div class='group-meta'>"
		+ (shop.npc ? "<span class='planner-chip'>NPC: " + escapeHtml(shop.npc) + "</span>" : "")
		+ (shop.location ? "<span class='planner-chip'>Location: " + escapeHtml(shop.location) + "</span>" : "")
		+ tagChipsHtml(shop.tags)
		+ "</div>"
		+ joinCmdHtml(shop.location, shop.npc)
		+ "</div>"
		+ "<div class='group-progress'><div class='progress-bar-wrap'><div class='progress-bar-fill' style='width:" + progress.pct + "%;'></div></div><div class='progress-text'>" + escapeHtml(progress.text) + "</div></div>"
		+ "</div>"
		+ "<div class='group-body'>"
		+ "<div class='source-header'>To Acquire</div>"
		+ "<div class='group-items-grid'>" + neededHtml + "</div>"
		+ (shop.owned.length ? "<button class='owned-toggle' type='button'>Owned Items (" + shop.owned.length + ")</button><div class='owned-collapsed'><div class='group-items-grid'>" + ownedHtml + "</div></div>" : "")
		+ "</div>";
	wrap.appendChild(group);
}

function renderToMerge() {
	var filters = getFilters();
	var shops = [];

	Object.values(merge_shops_json || {}).forEach(function(shop) {
		if (isRareTaggedEntity(shop)) {
			return;
		}
		var needed = [];
		var owned = [];
		var allItems = flattenShopItems(shop);
		var shopTags = (shop.tags || []).slice();
		if (!passesTagFilter(shopTags.concat(shopTags.includes("seasonal") ? [] : ["normal"]), filters) && shopTags.includes("seasonal")) {
			return;
		}

		allItems.forEach(function(item) {
			if (isMiscItem(item.name, item.slug)) {
				return;
			}
			var lookup = getSlugLookup().get(normalizeSlug(item.slug).toLowerCase());
			if ((lookup && isRareItemDetails(lookup[1])) || (!lookup && hasRareLikeTag(item.tags))) {
				return;
			}
			var detailTags = lookup ? getItemTags(lookup[1]) : [];
			if (!passesTagFilter(detailTags, filters)) {
				return;
			}
			if (!matchSearch([shop.name, shop.npc && shop.npc.name, shop.location && shop.location.name, item.name])) {
				return;
			}
			var record = {
				name: item.name,
				slug: item.slug,
				tags: detailTags,
				ingredients: item.ingredients || []
			};
			if (isOwned(item.name)) {
				owned.push(record);
			} else {
				needed.push(record);
			}
		});

		if (!needed.length) {
			return;
		}

		var total = needed.length + owned.length;
		shops.push({
			name: shop.name,
			slug: shop.slug,
			npc: shop.npc && shop.npc.name ? shop.npc.name : "",
			location: shop.location && shop.location.name ? shop.location.name : "",
			tags: shopTags,
			needed: needed,
			owned: owned,
			total: total,
			progress: total ? owned.length / total : 0
		});
	});

	shops.sort(function(a, b) {
		if (b.progress !== a.progress) {
			return b.progress - a.progress;
		}
		return a.name.localeCompare(b.name);
	});

	tabState.tomerge.groups = shops;
	updateStats("Loaded Account Items: " + _accountItems.length, "Visible Results: " + shops.length + " groups");
	renderGroupPage("tomerge", tabState.tomerge.page, renderMergeGroup);
}

function renderQuestGroup(wrap, group) {
	var progress = makeProgress(group.ownedRewards.length, group.totalRewards);
	var rewardHtml = group.neededRewards.map(function(item) {
		return ""
			+ "<div class='item-card' data-item-name='" + escapeHtml(item.name) + "' data-slug='" + escapeHtml(normalizeSlug(item.slug)) + "'>"
			+ "<span class='card-badge needed'>To Acquire</span>"
			+ "<div class='card-image-wrap'>"
			+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrl(item.slug)) + "' alt='" + escapeHtml(item.name) + "'>"
			+ "<div class='card-tag-stack'>" + tagOverlayHtml(item.tags) + "</div>"
			+ "</div>"
			+ "<div class='card-body'><div class='card-name'>" + escapeHtml(item.name) + "</div></div>"
			+ "</div>";
	}).join("");

	var subquestHtml = group.subquests.map(function(q) {
		var reqHtml = (q.requirements || []).map(function(req) {
			var drops = (req.dropped_by || []).map(function(drop) { return drop.name; }).join(", ");
			return "<div class='req-sub'>" + escapeHtml(req.name + " x" + req.qty) + (drops ? " - " + escapeHtml(drops) : "") + "</div>";
		}).join("");
		var rewards = (q.rewardNames || []).join(", ");
		return ""
			+ "<div class='subquest-section'>"
			+ "<div class='subquest-header'><strong>" + escapeHtml(q.name) + "</strong>" + (q.pageSlug ? "<a href='" + escapeHtml(wikiUrl(q.pageSlug)) + "' target='_blank' rel='noreferrer'>Wiki</a>" : "") + "</div>"
			+ (q.description ? "<div class='subquest-desc'>" + escapeHtml(q.description) + "</div>" : "")
			+ (reqHtml ? "<div class='req-list'><div class='source-header'>Requirements</div>" + reqHtml + "</div>" : "")
			+ (rewards ? "<div class='req-list'><div class='source-header'>Rewards</div><div class='req-sub'>" + escapeHtml(rewards) + "</div></div>" : "")
			+ "</div>";
	}).join("");

	var ownedHtml = group.ownedRewards.map(function(item) {
		return ""
			+ "<div class='item-card' data-item-name='" + escapeHtml(item.name) + "' data-slug='" + escapeHtml(normalizeSlug(item.slug)) + "'>"
			+ "<span class='card-badge owned'>Owned</span>"
			+ "<div class='card-image-wrap'>"
			+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrl(item.slug)) + "' alt='" + escapeHtml(item.name) + "'>"
			+ "<div class='card-tag-stack'>" + tagOverlayHtml(item.tags) + "</div>"
			+ "</div>"
			+ "<div class='card-body'><div class='card-name'>" + escapeHtml(item.name) + "</div></div>"
			+ "</div>";
	}).join("");

	var card = document.createElement("div");
	card.className = "group-card";
	card.innerHTML = ""
		+ "<div class='group-header'>"
		+ "<div>"
		+ "<div class='group-title'>" + escapeHtml(group.title) + "</div>"
		+ "<div class='group-meta'>"
		+ group.npcs.map(function(npc) { return "<span class='planner-chip'>NPC: " + escapeHtml(npc) + "</span>"; }).join("")
		+ tagChipsHtml(group.tags)
		+ "</div>"
		+ joinCmdHtml(group.locationName, group.npcs[0] || "")
		+ "</div>"
		+ "<div class='group-progress'><div class='progress-bar-wrap'><div class='progress-bar-fill' style='width:" + progress.pct + "%;'></div></div><div class='progress-text'>" + escapeHtml(progress.text) + "</div></div>"
		+ "</div>"
		+ "<div class='group-body'>"
		+ "<div class='source-header'>To Acquire</div>"
		+ "<div class='group-items-grid'>" + rewardHtml + "</div>"
		+ subquestHtml
		+ (group.ownedRewards.length ? "<button class='owned-toggle' type='button'>Owned Rewards (" + group.ownedRewards.length + ")</button><div class='owned-collapsed'><div class='group-items-grid'>" + ownedHtml + "</div></div>" : "")
		+ "</div>";
	wrap.appendChild(card);
}

function renderToQuest() {
	var filters = getFilters();
	var grouped = new Map();

	Object.values(quests_json || {}).forEach(function(page) {
		if ((page.tags || []).includes("_index")) {
			return;
		}
		if (isRareTaggedEntity(page)) {
			return;
		}

		(page.quests || []).forEach(function(quest) {
			var validRewards = [];
			(quest.rewards && quest.rewards.items || []).forEach(function(reward) {
				if (isMiscItem(reward.name, reward.slug) || isCharacterPageBadge(reward.name, reward.slug)) {
					return;
				}
				var lookup = getNormalizedLookup().get(normalize(reward.name)) || getSlugLookup().get(normalizeSlug(reward.slug).toLowerCase());
				if ((lookup && isRareItemDetails(lookup[1])) || (!lookup && hasRareLikeTag(reward.tags))) {
					return;
				}
				var tags = lookup ? getItemTags(lookup[1]) : [];
				if (!passesTagFilter(tags, filters)) {
					return;
				}
				validRewards.push({
					name: reward.name,
					slug: reward.slug,
					tags: tags
				});
			});

			if (!validRewards.length) {
				return;
			}

			var key = validRewards.map(function(r) { return normalize(r.name); }).sort().join("|");
			var group = grouped.get(key);
			if (!group) {
				group = {
					key: key,
					title: validRewards.map(function(r) { return r.name; }).sort().join(" + "),
					tags: [],
					locationName: page.location && page.location.name ? page.location.name : "",
					npcs: [],
					subquests: [],
					rewardsByName: new Map()
				};
				grouped.set(key, group);
			}

			if (page.npc && page.npc.name && group.npcs.indexOf(page.npc.name) === -1) {
				group.npcs.push(page.npc.name);
			}
			validRewards.forEach(function(reward) {
				group.rewardsByName.set(normalize(reward.name), reward);
				reward.tags.forEach(function(tag) {
					if (group.tags.indexOf(tag) === -1) {
						group.tags.push(tag);
					}
				});
			});
			group.subquests.push({
				name: quest.name,
				description: quest.description,
				requirements: quest.items_required || [],
				rewardNames: validRewards.map(function(r) { return r.name; }),
				pageSlug: page.slug
			});
		});
	});

	var groups = [];
	grouped.forEach(function(group) {
		group.allRewards = Array.from(group.rewardsByName.values()).sort(sortByName);
		group.neededRewards = group.allRewards.filter(function(item) { return !isOwned(item.name); });
		group.ownedRewards = group.allRewards.filter(function(item) { return isOwned(item.name); });
		group.totalRewards = group.allRewards.length;

		if (!group.neededRewards.length) {
			return;
		}
		if (!matchSearch([group.title].concat(group.npcs).concat(group.subquests.map(function(q) { return q.name; })))) {
			return;
		}
		groups.push(group);
	});

	groups.sort(function(a, b) {
		var ap = a.totalRewards ? a.ownedRewards.length / a.totalRewards : 0;
		var bp = b.totalRewards ? b.ownedRewards.length / b.totalRewards : 0;
		if (bp !== ap) {
			return bp - ap;
		}
		return a.title.localeCompare(b.title);
	});

	tabState.toquest.groups = groups;
	updateStats("Loaded Account Items: " + _accountItems.length, "Visible Results: " + groups.length + " groups");
	renderGroupPage("toquest", tabState.toquest.page, renderQuestGroup);
}

function renderCompleted() {
	var filters = getFilters();
	var wrap = document.getElementById("completed-wrap");
	wrap.innerHTML = "";

	var completedMerge = [];
	var completedQuest = [];
	var ownedVisible = new Set();
	var totalRareItems = 0;
	var totalPseudoRareItems = 0;
	var totalAcItems = 0;
	var totalAcSeasonalItems = 0;

	Object.values(merge_shops_json || {}).forEach(function(shop) {
		if (isRareTaggedEntity(shop)) {
			return;
		}
		var items = flattenShopItems(shop).filter(function(item) {
			if (isMiscItem(item.name, item.slug)) {
				return false;
			}
			var lookup = getSlugLookup().get(normalizeSlug(item.slug).toLowerCase());
			if ((lookup && isRareItemDetails(lookup[1])) || (!lookup && hasRareLikeTag(item.tags))) {
				return false;
			}
			var tags = lookup ? getItemTags(lookup[1]) : [];
			return passesTagFilter(tags, filters);
		});
		if (!items.length) {
			return;
		}
		if (items.every(function(item) { return isOwned(item.name); }) && matchSearch([shop.name, shop.npc && shop.npc.name, shop.location && shop.location.name])) {
			completedMerge.push(shop);
		}
	});

	Object.values(quests_json || {}).forEach(function(page) {
		if ((page.tags || []).includes("_index")) {
			return;
		}
		if (isRareTaggedEntity(page)) {
			return;
		}
		(page.quests || []).forEach(function(quest) {
			var rewards = (quest.rewards && quest.rewards.items || []).filter(function(reward) {
				if (isMiscItem(reward.name, reward.slug) || isCharacterPageBadge(reward.name, reward.slug)) {
					return false;
				}
				var lookup = getNormalizedLookup().get(normalize(reward.name)) || getSlugLookup().get(normalizeSlug(reward.slug).toLowerCase());
				if ((lookup && isRareItemDetails(lookup[1])) || (!lookup && hasRareLikeTag(reward.tags))) {
					return false;
				}
				var tags = lookup ? getItemTags(lookup[1]) : [];
				return passesTagFilter(tags, filters);
			});
			if (rewards.length && rewards.every(function(reward) { return isOwned(reward.name); }) && matchSearch([quest.name, page.npc && page.npc.name, page.location && page.location.name])) {
				completedQuest.push({
					page: page,
					quest: quest,
					rewards: rewards
				});
			}
		});
	});

	Object.entries(items_json || {}).forEach(function(entry) {
		var itemName = entry[0];
		var details = entry[1];
		var itemTags = getItemTags(details);
		if (!passesTagFilter(itemTags, filters)) {
			return;
		}
		if (!matchSearch([itemName, details[0], JSON.stringify(readDetail(details, "Location") || [])])) {
			return;
		}
		if (readFlag(details, "Rare")) {
			totalRareItems += 1;
		}
		if (readFlag(details, "Pseudo Rare")) {
			totalPseudoRareItems += 1;
		}
		if (readFlag(details, "AC") && readFlag(details, "Seasonal") && !readFlag(details, "Rare") && !readFlag(details, "Pseudo Rare")) {
			totalAcSeasonalItems += 1;
		}
		if (readFlag(details, "AC") && !readFlag(details, "Seasonal") && !readFlag(details, "Rare") && !readFlag(details, "Pseudo Rare")) {
			totalAcItems += 1;
		}
	});

	for (var i = 0; i < _accountItems.length; i++) {
		var normalizedName = _accountItems[i];
		var lookup = getNormalizedLookup().get(normalizedName);
		if (!lookup) {
			continue;
		}
		var details = lookup[1];
		if (!passesTagFilter(getItemTags(details), filters)) {
			continue;
		}
		if (!matchSearch([lookup[0], _accountWhere[i], details[0]])) {
			continue;
		}
		ownedVisible.add(normalizedName);
	}

	var ownedRareCount = 0;
	var ownedPseudoRareCount = 0;
	var ownedAcCount = 0;
	var ownedAcSeasonalCount = 0;
	ownedVisible.forEach(function(normalizedName) {
		var lookup = getNormalizedLookup().get(normalizedName);
		if (!lookup) {
			return;
		}
		var details = lookup[1];
		if (readFlag(details, "Rare")) {
			ownedRareCount += 1;
		}
		if (readFlag(details, "Pseudo Rare")) {
			ownedPseudoRareCount += 1;
		}
		if (readFlag(details, "AC") && readFlag(details, "Seasonal") && !readFlag(details, "Rare") && !readFlag(details, "Pseudo Rare")) {
			ownedAcSeasonalCount += 1;
		}
		if (readFlag(details, "AC") && !readFlag(details, "Seasonal") && !readFlag(details, "Rare") && !readFlag(details, "Pseudo Rare")) {
			ownedAcCount += 1;
		}
	});

	var summaryHtml = "";
	var sections = [];
	if (totalRareItems || totalPseudoRareItems || totalAcItems || totalAcSeasonalItems) {
		summaryHtml =
			"<div class='completed-summary-row'>"
			+ buildSummaryPie("Rare", ownedRareCount, totalRareItems, "rarity", totalRareItems + " rare total")
			+ buildSummaryPie("Pseudo Rare", ownedPseudoRareCount, totalPseudoRareItems, "rarity", totalPseudoRareItems + " pseudo-rare total")
			+ buildSummaryPie("AC Tagged Items", ownedAcCount, totalAcItems, "ac")
			+ buildSummaryPie("AC + Seasonal", ownedAcSeasonalCount, totalAcSeasonalItems, "ac-seasonal")
			+ "</div>";
	}
	if (completedMerge.length) {
		sections.push("<div class='completed-section'><div class='completed-section-title'>Completed Item Merge Shops</div>" + completedMerge.map(function(shop) {
			return "<div class='req-sub'><a href='" + escapeHtml(wikiUrl(shop.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(shop.name) + "</a></div>";
		}).join("") + "</div>");
	}
	if (completedQuest.length) {
		sections.push("<div class='completed-section'><div class='completed-section-title'>Completed Item Quests</div>" + completedQuest.map(function(row) {
			return "<div class='req-sub'><a href='" + escapeHtml(wikiUrl(row.page.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(row.quest.name) + "</a> - " + escapeHtml((row.page.npc && row.page.npc.name) || "") + "</div>";
		}).join("") + "</div>");
	}

	if (!sections.length) {
		wrap.innerHTML = summaryHtml + "<div class='empty-state'>No completed content matches the current filters.</div>";
	} else {
		wrap.innerHTML = summaryHtml + sections.join("");
	}

	tabState.completed.sections = sections;
	updateStats("Loaded Account Items: " + _accountItems.length, "Visible Results: " + sections.length + " sections");
	loadCardImages();
}

function switchTab(tabName) {
	activeTab = tabName;
	document.querySelectorAll(".tab-link").forEach(function(link) {
		link.classList.toggle("active", link.dataset.tab === tabName);
	});
	document.querySelectorAll(".tab-content").forEach(function(panel) {
		panel.classList.toggle("active", panel.id === "tab-" + tabName);
	});
	document.getElementById("location-filter").hidden = tabName !== "inbank";
	document.querySelectorAll(".inbank-only-filter").forEach(function(el) {
		el.hidden = tabName !== "inbank";
	});
	renderActiveTab(false);
}

function renderActiveTab(force) {
	if (force) {
		tabState[activeTab].page = 0;
	}
	if (activeTab === "todrop") {
		renderToDrop();
	} else if (activeTab === "inbank") {
		renderInBank();
	} else if (activeTab === "tomerge") {
		renderToMerge();
	} else if (activeTab === "toquest") {
		renderToQuest();
	} else if (activeTab === "completed") {
		renderCompleted();
	}
}

function invalidateAllTabs() {
	tabState.todrop.page = 0;
	tabState.inbank.page = 0;
	tabState.tomerge.page = 0;
	tabState.toquest.page = 0;
	tabState.todrop.items = [];
	tabState.inbank.items = [];
	tabState.tomerge.groups = [];
	tabState.toquest.groups = [];
	tabState.completed.sections = [];
	renderActiveTab(true);
}

async function loadCardImage(img) {
	var wikiUrlValue = img.dataset.wikiUrl;
	if (!wikiUrlValue) {
		return;
	}
	if (img.dataset.errorBound !== "true") {
		img.dataset.errorBound = "true";
		img.addEventListener("error", function() {
			img.src = MISSING_IMAGE_SRC;
			img.dataset.imageState = "missing";
		});
	}
	img.dataset.imageState = "loading";
	img.src = EMPTY_IMAGE_SRC;
	if (_imageCache.has(wikiUrlValue)) {
		var cachedSrc = await _imageCache.get(wikiUrlValue);
		if (cachedSrc) {
			img.src = cachedSrc;
			img.dataset.imageState = "loaded";
		} else {
			img.src = MISSING_IMAGE_SRC;
			img.dataset.imageState = "missing";
		}
		return;
	}

	var promise;
	if (typeof window._wikimg === "function") {
		promise = window._wikimg(wikiUrlValue).then(function(images) {
			return images && images[0] ? preloadImage(images[0]) : "";
		}).catch(function() {
			return "";
		});
	} else {
		promise = Promise.resolve("");
	}

	_imageCache.set(wikiUrlValue, promise);
	var src = await promise;
	if (src) {
		img.src = src;
		img.dataset.imageState = "loaded";
	} else {
		img.src = MISSING_IMAGE_SRC;
		img.dataset.imageState = "missing";
	}
}

function loadCardImages() {
	var targets = document.querySelectorAll(".planner-card-image");
	targets.forEach(function(img) {
		if (img.closest(".owned-collapsed") && !img.closest(".owned-collapsed").classList.contains("active")) {
			return;
		}
		if (img.dataset.loaded === "true") {
			return;
		}
		img.dataset.loaded = "true";
		loadCardImage(img);
	});
}

function openItemModal(item_name, d) {
	var modal = document.getElementById("item-modal");
	var tags = getItemTags(d);
	document.getElementById("modal-title").textContent = item_name;
	document.getElementById("modal-tags").innerHTML = tagChipsHtml(tags);
	document.getElementById("modal-image").dataset.wikiUrl = wikiUrl(d[0]);
	document.getElementById("modal-image").src = EMPTY_IMAGE_SRC;
	document.getElementById("modal-image").dataset.imageState = "loading";
	loadCardImage(document.getElementById("modal-image"));
	document.getElementById("modal-slug").textContent = d[0];
	document.getElementById("modal-wiki-link").href = wikiUrl(d[0]);

	document.getElementById("modal-description").innerHTML = "<span class='modal-label'>Description</span><div class='modal-value'>" + escapeHtml(readDetail(d, "Description") || "N/A") + "</div>";
	document.getElementById("modal-price").innerHTML = renderModalPrice(readDetail(d, "Price"));
	document.getElementById("modal-sellback").innerHTML = renderModalSellback(readDetail(d, "Sellback"));
	document.getElementById("modal-location").innerHTML = renderModalLocation(readDetail(d, "Location"));
	document.getElementById("modal-requirements").innerHTML = renderModalRequirements(item_name, d);

	var flags = [];
	["Rare", "AC", "Legend", "Seasonal", "Pseudo Rare", "Special Offer", "Beta", "Color Custom", "Custom Animation"].forEach(function(flag) {
		if (readFlag(d, flag)) {
			flags.push(flag);
		}
	});
	document.getElementById("modal-flags").innerHTML = "<span class='modal-label'>Flags</span><div class='modal-value'>" + (flags.length ? escapeHtml(flags.join(", ")) : "None") + "</div>";
	modal.classList.add("active");
}

function closeItemModal() {
	document.getElementById("item-modal").classList.remove("active");
}

function formatMoneyValue(value) {
	if (Array.isArray(value)) {
		return value.map(function(part) { return formatMoneyValue(part); }).join(" ");
	}
	return String(value || "").trim();
}

function renderModalPrice(priceData) {
	if (!priceData || !priceData.length) {
		return "<span class='modal-label'>Price</span><div class='modal-value'>N/A</div>";
	}

	var type = priceData[0];
	if (type === "Drop") {
		return "<span class='modal-label'>Price</span><div class='modal-value'>Drop</div>";
	}
	if (type === "Quest") {
		var questSlug = priceData[2] || "";
		var questName = priceData[1] || "Quest";
		var html = "<span class='modal-label'>Price</span><div class='modal-value'>Quest Reward";
		if (questSlug) {
			html += " from <a href='" + escapeHtml(wikiUrl(questSlug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(questName) + "</a>";
		} else if (questName) {
			html += " from " + escapeHtml(questName);
		}
		return html + "</div>";
	}
	if (type === "Merge") {
		var mergeSlug = priceData[2] || "";
		var mergeName = priceData[1] || "Merge Shop";
		var mergeHtml = "<span class='modal-label'>Price</span><div class='modal-value'>Merge";
		if (mergeSlug) {
			mergeHtml += " in <a href='" + escapeHtml(wikiUrl(mergeSlug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(mergeName) + "</a>";
		} else if (mergeName) {
			mergeHtml += " in " + escapeHtml(mergeName);
		}
		return mergeHtml + "</div>";
	}
	return "<span class='modal-label'>Price</span><div class='modal-value'>" + escapeHtml(formatMoneyValue(priceData)) + "</div>";
}

function renderModalSellback(sellbackData) {
	if (!sellbackData) {
		return "<span class='modal-label'>Sellback</span><div class='modal-value'>N/A</div>";
	}
	if (!Array.isArray(sellbackData)) {
		return "<span class='modal-label'>Sellback</span><div class='modal-value'>" + escapeHtml(String(sellbackData)) + "</div>";
	}

	if (sellbackData[0] === "First 24 Hours") {
		var firstWindow = sellbackData[1] ? formatMoneyValue(sellbackData[1]) : "";
		var laterWindow = sellbackData[3] ? formatMoneyValue(sellbackData[3]) : "";
		var parts = [];
		if (firstWindow) {
			parts.push("<div class='req-sub'>First 24 Hours: " + escapeHtml(firstWindow) + "</div>");
		}
		if (laterWindow) {
			parts.push("<div class='req-sub'>After 24 Hours: " + escapeHtml(laterWindow) + "</div>");
		}
		return "<span class='modal-label'>Sellback</span><div class='modal-value'>" + parts.join("") + "</div>";
	}

	return "<span class='modal-label'>Sellback</span><div class='modal-value'>" + escapeHtml(formatMoneyValue(sellbackData)) + "</div>";
}

function renderModalLocation(locData) {
	var html = "<span class='modal-label'>Location</span>";
	if (!locData || !locData.length) {
		return html + "<div class='modal-value'>N/A</div>";
	}

	var parts = locData.map(function(entry) {
		if (!Array.isArray(entry)) {
		return "<div class='modal-location-entry'><div class='modal-value'>" + escapeHtml(String(entry)) + "</div></div>";
		}
		var locName = entry[2] || entry[0];
		var shopName = entry[0];
		var locSlug = entry[3] || entry[1] || "";
		var locationLink = "<div class='modal-value'><a href='" + escapeHtml(wikiUrl(entry[1] || entry[3])) + "' target='_blank' rel='noreferrer'>" + escapeHtml(locName) + "</a></div>";
		var joinHtml = joinCmdHtml(locName, shopName, locSlug);
		return "<div class='modal-location-entry'>" + locationLink + (joinHtml ? joinHtml : "") + "</div>";
	});
	return html + parts.join("");
}

function renderModalRequirements(item_name, d) {
	var price = readDetail(d, "Price") || [];
	var html = "<span class='modal-label'>" + (price[0] === "Drop" ? "Dropped by" : "Requirements") + "</span>";
	if (price[0] === "Merge") {
		var box = document.createElement("div");
		renderMergeRequirements(box, d);
		return html + box.innerHTML;
	}
	if (price[0] === "Quest") {
		var questBox = document.createElement("div");
		renderQuestRequirements(questBox, item_name, d);
		return html + questBox.innerHTML;
	}
	if (price[0] === "Drop") {
		var dropBox = document.createElement("div");
		renderDropInfo(dropBox, d);
		return html + dropBox.innerHTML;
	}
	return html + "<div class='modal-value'>None</div>";
}

function renderMergeRequirements(el, d) {
	var price = readDetail(d, "Price") || [];
	var ingredients = price[3] || [];
	if (!ingredients.length) {
		el.innerHTML = "<div class='modal-value'>None</div>";
		return;
	}
	el.innerHTML = ingredients.map(function(ing) {
		return "<div class='req-sub'>" + escapeHtml(ing[0] + " x" + ing[2]) + "</div>";
	}).join("");
}

function renderQuestRequirements(el, item_name, d) {
	var matches = [];
	Object.values(quests_json || {}).forEach(function(page) {
		(page.quests || []).forEach(function(quest) {
			var rewardNames = (quest.rewards && quest.rewards.items || []).map(function(item) { return normalize(item.name); });
			if (rewardNames.indexOf(normalize(item_name)) !== -1) {
				matches.push({
					page: page,
					quest: quest
				});
			}
		});
	});
	if (!matches.length) {
		el.innerHTML = "<div class='modal-value'>Quest data not found.</div>";
		return;
	}
	el.innerHTML = matches.map(function(match) {
		return "<div class='req-sub'><strong>" + escapeHtml(match.quest.name) + "</strong> - " + escapeHtml((match.page.npc && match.page.npc.name) || "") + "</div>";
	}).join("");
}

function renderDropInfo(el, d) {
	var price = readDetail(d, "Price") || [];
	if (!price.length) {
		el.innerHTML = "<div class='modal-value'>N/A</div>";
		return;
	}
	if (Array.isArray(price[1])) {
		el.innerHTML = price.slice(1).map(function(source) {
			return "<div class='req-sub'><a href='" + escapeHtml(wikiUrl(source[0])) + "' target='_blank' rel='noreferrer'>" + escapeHtml(source[1]) + "</a></div>";
		}).join("");
		return;
	}
	var monsterName = price[1] || "";
	var monsterSlug = price[2] || "";
	if (monsterSlug) {
		el.innerHTML = "<div class='req-sub'><a href='" + escapeHtml(wikiUrl(monsterSlug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(monsterName) + "</a></div>";
		return;
	}
	el.innerHTML = "<div class='req-sub'>" + escapeHtml(monsterName) + "</div>";
}

function process_ToFarm_Page() {
	return renderActiveTab(true);
}

function renderPage() {
	return renderActiveTab(false);
}

function reProcess_ToFarm_Page() {
	invalidateAllTabs();
}

if (window.location.href.includes("tofarm.html")) {
	document.addEventListener("DOMContentLoaded", async function() {
		await toFarmDataReady;

		chrome.storage.local.get({
			aqwitems: [],
			aqwwhere: [],
			tofarmGridSize: "medium"
		}, function(result) {
			_accountItems = (result.aqwitems || []).map(function(item) { return normalize(item); });
			_accountWhere = result.aqwwhere || [];
			applyGridSize(result.tofarmGridSize || "medium");

			renderToDrop();

			document.querySelectorAll(".tab-link").forEach(function(link) {
				link.addEventListener("click", function(event) {
					event.preventDefault();
					switchTab(link.dataset.tab);
				});
			});

			["Filter_AcItem", "Filter_LegendItem", "Filter_NormalItem", "Filter_SeasonalItem", "Filter_RareItem", "Filter_PseudoRareItem"].forEach(function(id) {
				document.getElementById(id).addEventListener("change", invalidateAllTabs);
			});

			document.getElementById("location-filter").addEventListener("change", function() {
				tabState.inbank.page = 0;
				if (activeTab === "inbank") {
					renderInBank();
				}
			});

			document.getElementById("grid-size-select").addEventListener("change", function(event) {
				var value = applyGridSize(event.target.value);
				chrome.storage.local.set({ tofarmGridSize: value }, function() {});
			});

			document.getElementById("search-input").addEventListener("input", function(event) {
				clearTimeout(_searchTimer);
				_searchTimer = setTimeout(function() {
					searchTerm = event.target.value.trim().toLowerCase();
					invalidateAllTabs();
				}, 300);
			});

			document.body.addEventListener("click", function(event) {
				var pageBtn = event.target.closest("[data-page-tab]");
				if (pageBtn) {
					var state = tabState[pageBtn.dataset.pageTab];
					if (pageBtn.dataset.pageDir === "prev" && state.page > 0) {
						state.page -= 1;
					}
					if (pageBtn.dataset.pageDir === "next") {
						state.page += 1;
					}
					renderActiveTab(false);
					return;
				}

				var copyBtn = event.target.closest("[data-copy-join]");
				if (copyBtn) {
					copyJoinCmd(copyBtn, copyBtn.dataset.copyJoin);
					return;
				}

				var toggle = event.target.closest(".owned-toggle");
				if (toggle) {
					var collapsed = toggle.nextElementSibling;
					if (collapsed) {
						collapsed.classList.toggle("active");
						loadCardImages();
					}
					return;
				}

				var itemCard = event.target.closest(".item-card[data-item-name]");
				if (itemCard && !event.target.closest(".copy-icon") && !event.target.closest("a")) {
					var itemLookup = getSlugLookup().get(String(itemCard.dataset.slug || "").toLowerCase()) || getNormalizedLookup().get(normalize(itemCard.dataset.itemName));
					if (itemLookup) {
						openItemModal(itemLookup[0], itemLookup[1]);
					}
				}
			});

			document.getElementById("modal-close").addEventListener("click", closeItemModal);
			document.getElementById("item-modal").addEventListener("click", function(event) {
				if (event.target.id === "item-modal") {
					closeItemModal();
				}
			});
			document.addEventListener("keydown", function(event) {
				if (event.key === "Escape") {
					closeItemModal();
				}
			});
		});
	});
}
