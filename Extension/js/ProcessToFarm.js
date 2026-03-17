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
var in_inventory_icon = chrome.runtime.getURL("images/in_inventory.png");
var in_bank_icon = chrome.runtime.getURL("images/in_bank.png");

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
var _accountType = [];
var _normalizedLookup = null;
var _slugLookup = null;
var _accountCountLookup = null;
var _imageCache = new Map();
var _imageVariantCache = new Map();
var _questChainDataReady = null;
var _questChainAccountDataReady = null;
var _questRewardLookup = null;
var _liveQuestBranchCache = new Map();
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

function fetchText(url) {
	return fetch(url).then(function(resp) {
		if (!resp.ok) {
			throw new Error("Failed to fetch " + url + ": " + resp.status);
		}
		return resp.text();
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

function getAccountCountLookup() {
	if (_accountCountLookup) {
		return _accountCountLookup;
	}

	var lookup = new Map();
	for (var i = 0; i < _accountItems.length; i++) {
		var normalizedName = _accountItems[i];
		var typeInfo = _accountType[i];
		var amount = 1;
		if (Array.isArray(typeInfo) && typeInfo.length > 1) {
			var parsed = parseInt(typeInfo[1], 10);
			if (!isNaN(parsed)) {
				amount = parsed;
			}
		}
		lookup.set(normalizedName, (lookup.get(normalizedName) || 0) + amount);
	}
	_accountCountLookup = lookup;
	return lookup;
}

function getOwnedAmount(name) {
	return getAccountCountLookup().get(normalize(name)) || 0;
}

function ensureQuestChainAccountDataReady() {
	if (_accountItems.length || _accountType.length) {
		return Promise.resolve();
	}
	if (_questChainAccountDataReady) {
		return _questChainAccountDataReady;
	}
	_questChainAccountDataReady = new Promise(function(resolve) {
		chrome.storage.local.get({
			aqwitems: [],
			aqwwhere: [],
			aqwtype: []
		}, function(result) {
			_accountItems = (result.aqwitems || []).map(function(item) { return normalize(item); });
			_accountWhere = result.aqwwhere || [];
			_accountType = result.aqwtype || [];
			_accountCountLookup = null;
			resolve();
		});
	});
	return _questChainAccountDataReady;
}

function buildMergeIngredientChip(ing) {
	var owned = getOwnedAmount(ing.name);
	var required = parseInt(ing.qty, 10) || 0;
	var ownedClass = owned >= required ? " met" : "";
	var nameHtml = "<span class='merge-ingredient-name'>" + escapeHtml(ing.name) + "</span>";
	var statsHtml = ""
		+ "<span class='merge-ingredient-stats'>"
		+ "<span class='merge-ingredient-count owned" + ownedClass + "'>Owned " + escapeHtml(String(owned)) + "</span>"
		+ "<span class='merge-ingredient-count need'>Need " + escapeHtml(String(ing.qty)) + "</span>"
		+ "</span>";

	if (!ing.slug) {
		return "<span class='planner-chip source-chip merge-ingredient-chip'>" + nameHtml + statsHtml + "</span>";
	}
	return "<a class='planner-chip source-chip merge-ingredient-chip' href='" + escapeHtml(wikiUrl(ing.slug)) + "' target='_blank' rel='noreferrer'>" + nameHtml + statsHtml + "</a>";
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

function ensureQuestChainDataReady() {
	if (quests_json) {
		return Promise.resolve();
	}
	if (_questChainDataReady) {
		return _questChainDataReady;
	}
	_questChainDataReady = fetchJson(chrome.runtime.getURL("data/quests.json")).then(function(data) {
		quests_json = data;
		_questRewardLookup = null;
	});
	return _questChainDataReady;
}

function getQuestRewardLookup() {
	if (_questRewardLookup) {
		return _questRewardLookup;
	}
	var lookup = new Map();
	Object.values(quests_json || {}).forEach(function(page) {
		if ((page.tags || []).includes("_index")) {
			return;
		}
		(page.quests || []).forEach(function(quest) {
			((quest.rewards && quest.rewards.items) || []).forEach(function(item) {
				var key = normalize(item.name);
				if (!lookup.has(key)) {
					lookup.set(key, []);
				}
				lookup.get(key).push({
					page: page,
					quest: quest,
					reward: item
				});
			});
		});
	});
	_questRewardLookup = lookup;
	return lookup;
}

function getCurrentWikiItemEntry() {
	var path = normalizeSlug(window.location.pathname || "");
	var bySlug = getSlugLookup().get(path.toLowerCase());
	if (bySlug) {
		return bySlug;
	}
	var title = document.getElementById("page-title");
	if (!title) {
		return null;
	}
	return getNormalizedLookup().get(normalize(title.textContent || ""));
}

function splitWikiReference(ref) {
	var raw = String(ref || "").trim();
	var hashIndex = raw.indexOf("#");
	var path = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
	var anchor = hashIndex === -1 ? "" : raw.slice(hashIndex + 1);
	return {
		path: normalizeSlug(path || ""),
		anchor: anchor || ""
	};
}

function findNamedAnchor(doc, anchorName) {
	if (!anchorName) {
		return null;
	}
	var anchors = doc.querySelectorAll("a[name]");
	for (var i = 0; i < anchors.length; i++) {
		if ((anchors[i].getAttribute("name") || "") === anchorName) {
			return anchors[i];
		}
	}
	return null;
}

function extractListItemSummary(li) {
	var slug = "";
	var text = "";
	for (var i = 0; i < li.childNodes.length; i++) {
		var node = li.childNodes[i];
		if (node.nodeType === 1 && node.tagName === "UL") {
			break;
		}
		if (!slug && node.nodeType === 1 && node.tagName === "A") {
			slug = node.getAttribute("href") || "";
		}
		text += node.textContent || "";
	}
	text = text.replace(/\s+/g, " ").trim();
	var match = text.match(/^(.*?)\s*x\s*([\d,]+)(?:\s*\(.*\))?$/i);
	return {
		name: (match ? match[1] : text).replace(/\s*\(.*\)\s*$/, "").trim(),
		slug: slug,
		qty: match ? match[2] : 1
	};
}

function findSectionList(container, sectionName) {
	var strongs = container.querySelectorAll("strong");
	var target = sectionName.toLowerCase();
	for (var i = 0; i < strongs.length; i++) {
		var label = (strongs[i].textContent || "").toLowerCase().replace(/[:\s]+/g, " ").trim();
		if (!label.startsWith(target)) {
			continue;
		}
		var block = strongs[i].closest("p,div") || strongs[i].parentElement;
		var next = block ? block.nextElementSibling : null;
		while (next) {
			if (next.tagName === "UL") {
				return next;
			}
			if (next.querySelector && next.querySelector("strong")) {
				break;
			}
			next = next.nextElementSibling;
		}
	}
	return null;
}

function parseQuestSectionItems(container, sectionName) {
	var list = findSectionList(container, sectionName);
	if (!list) {
		return [];
	}
	return Array.from(list.children).map(function(li) {
		var summary = extractListItemSummary(li);
		return {
			name: summary.name,
			slug: summary.slug,
			qty: summary.qty,
			dropped_by: Array.from(li.querySelectorAll("ul a")).map(function(link) {
				return {
					name: (link.textContent || "").trim(),
					slug: link.getAttribute("href") || ""
				};
			})
		};
	}).filter(function(item) {
		return item.name;
	});
}

function parseQuestSectionRewards(container) {
	var rewards = [];
	[
		{ label: "Items", choice: false },
		{ label: "Item", choice: false },
		{ label: "You may also choose one of", choice: true },
		{ label: "You may choose one of", choice: true },
		{ label: "Choose one of", choice: true }
	].forEach(function(def) {
		parseQuestSectionItems(container, def.label).forEach(function(item) {
			rewards.push({
				name: item.name,
				slug: item.slug,
				qty: item.qty,
				choice: def.choice
			});
		});
	});
	return rewards;
}

function extractSectionLink(node, pickLast) {
	if (!node || !node.querySelectorAll) {
		return null;
	}
	var links = Array.from(node.querySelectorAll("a[href]"));
	if (!links.length && node.nextElementSibling && node.nextElementSibling.tagName === "UL") {
		links = Array.from(node.nextElementSibling.querySelectorAll("a[href]"));
	}
	if (!links.length) {
		return null;
	}
	var link = pickLast ? links[links.length - 1] : links[0];
	return {
		name: (link.textContent || "").trim(),
		slug: link.getAttribute("href") || ""
	};
}

function parseQuestSectionMeta(nodes) {
	var location = null;
	var npc = null;
	var requirementsNote = "";

	nodes.forEach(function(node) {
		var text = (node.textContent || "").replace(/\s+/g, " ").trim();
		var lowered = text.toLowerCase();
		if (!text) {
			return;
		}
		if (!location && (
			lowered.indexOf("quest locations:") !== -1 ||
			lowered.indexOf("quest location:") !== -1 ||
			lowered.indexOf("locations:") !== -1 ||
			lowered.indexOf("location:") !== -1
		)) {
			location = extractSectionLink(node, false);
		}
		if (!npc && (
			lowered.indexOf("quests begun from:") !== -1 ||
			lowered.indexOf("quest begun from:") !== -1
		)) {
			npc = extractSectionLink(node, true);
		}
		if (!requirementsNote && /^Requirements/i.test(text)) {
			requirementsNote = text.replace(/^Requirements:\s*/i, "").trim();
		}
	});

	return {
		location: location,
		npc: npc,
		requirementsNote: requirementsNote
	};
}

function parseQuestBranchesFromHtml(html, questRef) {
	var doc = new DOMParser().parseFromString(html, "text/html");
	var anchorEl = findNamedAnchor(doc, questRef.anchor);
	if (!anchorEl) {
		return [];
	}

	var metaNodes = [];
	var cursor = anchorEl.closest("p") || anchorEl.parentElement;
	var tabView = null;
	while (cursor && cursor.nextElementSibling) {
		cursor = cursor.nextElementSibling;
		if (cursor.classList && cursor.classList.contains("yui-navset")) {
			tabView = cursor;
			break;
		}
		if (cursor.tagName === "HR") {
			break;
		}
		metaNodes.push(cursor);
	}

	if (!tabView) {
		return [];
	}

	var meta = parseQuestSectionMeta(metaNodes);
	var pageTitle = doc.getElementById("page-title");
	var page = {
		name: pageTitle ? (pageTitle.textContent || "").trim() : questRef.path.replace(/^\//, ""),
		slug: questRef.path,
		location: meta.location,
		npc: meta.npc
	};
	var labels = Array.from(tabView.querySelectorAll("ul.yui-nav > li"));
	var panes = Array.from(tabView.querySelectorAll("div.yui-content > div"));

	return panes.map(function(pane, index) {
		return {
			page: page,
			quest: {
				name: (labels[index] ? labels[index].textContent : "") || ("Quest " + (index + 1)),
				items_required: parseQuestSectionItems(pane, "Items Required"),
				rewards: {
					items: parseQuestSectionRewards(pane)
				},
				requirements_note: meta.requirementsNote
			},
			reward: null
		};
	}).filter(function(entry) {
		return entry.quest.name;
	});
}

function fetchQuestBranchesFromWiki(ref) {
	var questRef = splitWikiReference(ref);
	if (!questRef.path || !questRef.anchor) {
		return Promise.resolve([]);
	}
	var cacheKey = questRef.path + "#" + questRef.anchor;
	if (_liveQuestBranchCache.has(cacheKey)) {
		return _liveQuestBranchCache.get(cacheKey);
	}
	var promise = fetchText(window.location.origin + questRef.path).then(function(html) {
		return parseQuestBranchesFromHtml(html, questRef);
	}).catch(function() {
		return [];
	});
	_liveQuestBranchCache.set(cacheKey, promise);
	return promise;
}

function findQuestChainMount(contentEl, sourceType) {
	if (!contentEl) {
		return null;
	}
	if (sourceType === "Merge") {
		var lists = contentEl.querySelectorAll("ul");
		for (var i = 0; i < lists.length; i++) {
			if ((lists[i].textContent || "").includes("Merge the following")) {
				return lists[i];
			}
		}
	}
	var paragraphs = contentEl.querySelectorAll("p");
	for (var j = 0; j < paragraphs.length; j++) {
		if ((paragraphs[j].textContent || "").includes("Price:")) {
			return paragraphs[j];
		}
	}
	return contentEl.firstElementChild || null;
}

function ensureQuestChainUi() {
	if (document.getElementById("aqw-chain-style")) {
		return;
	}
	var style = document.createElement("style");
	style.id = "aqw-chain-style";
	style.textContent = ""
		+ ".aqw-chain-launch{display:inline-flex;align-items:center;justify-content:center;min-width:140px;height:29px;margin:12px 0 4px;padding:0 14px 2px;border:none;background:transparent url('" + chrome.runtime.getURL("images/tab.png") + "') no-repeat center/100% 100%;color:#fff;cursor:pointer;font-size:11px;font-weight:800;line-height:1;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 0 #000;white-space:nowrap;}"
		+ ".aqw-chain-panel{margin:8px 0 18px;color:#2b1b24;background:transparent;}"
		+ ".aqw-chain-panel[hidden]{display:none !important;}"
		+ ".aqw-chain-panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:4px 0 10px;border-bottom:1px solid rgba(87,40,69,0.16);}"
		+ ".aqw-chain-title{font-size:1.02rem;font-weight:800;color:#58294b;}"
		+ ".aqw-chain-subtitle{margin-top:4px;color:#6b5560;font-size:0.9rem;}"
		+ ".aqw-chain-actions{display:flex;align-items:center;gap:8px;}"
		+ ".aqw-chain-action{padding:4px 9px;border:1px solid rgba(87,40,69,0.18);background:rgba(255,255,255,0.62);color:#58294b;cursor:pointer;font-size:0.78rem;font-weight:700;}"
		+ ".aqw-chain-body{padding:12px 0 0;display:flex;flex-direction:column;gap:10px;}"
		+ ".aqw-chain-empty,.aqw-chain-loading{padding:8px 0;color:#6b5560;}"
		+ ".aqw-chain-hint{color:#6b5560;font-size:0.84rem;line-height:1.45;}"
		+ ".aqw-chain-legend{display:flex;flex-wrap:wrap;gap:10px;}"
		+ ".aqw-chain-legend span{display:inline-flex;align-items:center;gap:6px;font-size:0.76rem;color:#6b5560;}"
		+ ".aqw-chain-dot{width:10px;height:10px;display:inline-block;border-radius:50%;}"
			+ ".aqw-chain-graph-wrap{position:relative;}"
			+ ".aqw-chain-graph{min-height:620px;border:1px solid rgba(87,40,69,0.14);background:rgba(255,255,255,0.10);}"
			+ ".aqw-chain-status-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;}"
			+ ".aqw-chain-status-badge{position:absolute;display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:20px;padding:0 6px;transform:translate(-50%, -50%);font-size:0.72rem;font-weight:800;border-radius:3px;border:1px solid rgba(42,18,30,0.22);box-shadow:0 2px 6px rgba(0,0,0,0.12);}"
			+ ".aqw-chain-status-badge.is-complete{background:rgba(72,120,54,0.94);color:#f6ffea;}"
			+ ".aqw-chain-status-badge.is-missing{background:rgba(130,36,40,0.96);color:#fff2e8;}"
			+ ".aqw-chain-choice-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;}"
			+ ".aqw-chain-choice-node{position:absolute;display:flex;align-items:center;justify-content:center;transform:translate(-50%, -50%);pointer-events:auto;}"
			+ ".aqw-chain-choice-node select{min-width:140px;max-width:190px;padding:4px 8px;border:1px solid rgba(87,40,69,0.18);background:rgba(255,255,255,0.96);color:#58294b;font-size:0.78rem;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,0.08);}"
		+ "@media (max-width: 980px){.aqw-chain-graph{min-height:460px;}}";
	document.head.appendChild(style);
}

function findQuestMatchesForItem(item_name) {
	return (getQuestRewardLookup().get(normalize(item_name)) || []).slice();
}

async function findQuestMatchesForItemAsync(item_name, d) {
	var matches = findQuestMatchesForItem(item_name);
	if (matches.length) {
		return matches;
	}
	var price = readDetail(d, "Price") || [];
	if (price[0] !== "Quest" || !price[2]) {
		return [];
	}
	var liveMatches = await fetchQuestBranchesFromWiki(price[2]);
	var normalizedName = normalize(item_name);
	var filtered = liveMatches.filter(function(entry) {
		return ((entry.quest.rewards && entry.quest.rewards.items) || []).some(function(reward) {
			return normalize(reward.name) === normalizedName;
		});
	});
	if (filtered.length) {
		return filtered;
	}
	var questName = normalize(price[1] || "");
	if (questName) {
		var byQuestName = liveMatches.filter(function(entry) {
			return normalize(entry.quest && entry.quest.name || "") === questName;
		});
		if (byQuestName.length) {
			return byQuestName;
		}
	}
	return liveMatches.length === 1 ? liveMatches : [];
}

async function buildChainForRequirement(reqOrName, slug, qty, ctx) {
	var req = typeof reqOrName === "object" && reqOrName ? reqOrName : {
		name: reqOrName,
		slug: slug,
		qty: qty
	};
	var lookup = getNormalizedLookup().get(normalize(req.name)) || getSlugLookup().get(normalizeSlug(req.slug).toLowerCase());
	if (!lookup) {
		var droppedBy = (req.dropped_by || []).map(function(source) {
			return {
				kind: "source",
				sourceType: "Drop",
				name: source.name || "Monster",
				slug: source.slug || "",
				meta: [],
				children: []
			};
		});
		return {
			kind: "item",
			name: req.name,
			slug: req.slug || "",
			qty: req.qty || 1,
			missing: !droppedBy.length,
			sources: droppedBy
		};
	}
	return buildQuestChainTree(lookup[0], lookup[1], req.qty, {
		path: new Set(ctx.path),
		counter: ctx.counter,
		depth: ctx.depth + 1
	});
}

async function buildItemSourceBranches(item_name, d, ctx) {
	var price = readDetail(d, "Price") || [];
	var type = price[0];
	if (type === "Merge") {
		var ingredients = price[3] || [];
		return [{
			kind: "source",
			sourceType: "Merge Shop",
			name: price[1] || "Merge Shop",
			slug: price[2] || "",
			meta: [],
			children: await Promise.all(ingredients.map(function(ing) {
				return buildChainForRequirement({
					name: ing[0],
					slug: ing[1],
					qty: ing[2]
				}, "", "", ctx);
			}))
		}];
	}
	if (type === "Quest") {
		var matches = await findQuestMatchesForItemAsync(item_name, d);
		if (!matches.length) {
			return [{
				kind: "source",
				sourceType: "Quest",
				name: price[1] || "Quest Reward",
				slug: price[2] || "",
				meta: ["Quest data unavailable"],
				children: []
			}];
		}
		return Promise.all(matches.map(async function(match) {
			var meta = [];
			var rewardQty = 1;
			if (match.reward && match.reward.qty) {
				var parsedRewardQty = parseInt(match.reward.qty, 10);
				if (!isNaN(parsedRewardQty) && parsedRewardQty > 0) {
					rewardQty = parsedRewardQty;
				}
			}
			var requiredRuns = Math.max(1, Math.ceil((parseInt(ctx.requiredQty, 10) || 1) / rewardQty));
			if (match.page.npc && match.page.npc.name) {
				meta.push("NPC: " + match.page.npc.name);
			}
			if (match.page.location && match.page.location.name) {
				meta.push("Location: " + match.page.location.name);
			}
			if (match.quest.requirements_note) {
				meta.push("Requires: " + match.quest.requirements_note);
			}
			meta.push("Gives: " + rewardQty);
			meta.push("Turn-ins needed: " + requiredRuns);
			return {
				kind: "source",
				sourceType: "Quest",
				name: match.quest.name || price[1] || "Quest Reward",
				slug: (match.page.slug || price[2] || "").replace(/#.*$/, ""),
				meta: meta,
				rewardQty: rewardQty,
				requiredRuns: requiredRuns,
				children: await Promise.all(((match.quest.items_required) || []).map(function(req) {
					return buildChainForRequirement(req, "", "", ctx);
				}))
			};
		}));
	}
	if (type === "Drop") {
		if (Array.isArray(price[1])) {
			return price.slice(1).map(function(source) {
				return {
					kind: "source",
					sourceType: "Drop",
					name: source[1] || "Monster",
					slug: source[0] || "",
					meta: ["Any one source works"],
					children: []
				};
			});
		}
		return [{
			kind: "source",
			sourceType: "Drop",
			name: price[1] || "Monster",
			slug: price[2] || "",
			meta: [],
			children: []
		}];
	}
	if (type === "AC" || type === "GOLD") {
		return [{
			kind: "source",
			sourceType: "Purchase",
			name: type + " Item",
			slug: "",
			meta: [formatMoneyValue(price.slice(1))],
			children: []
		}];
	}
	return [{
		kind: "source",
		sourceType: type || "Unknown",
		name: item_name,
		slug: d[0] || "",
		meta: [formatMoneyValue(price)],
		children: []
	}];
}

async function buildQuestChainTree(item_name, d, qty, ctx) {
	var state = ctx || {
		path: new Set(),
		counter: { value: 0 },
		depth: 0
	};
	var key = normalize(item_name) + "|" + normalizeSlug(d && d[0]).toLowerCase();
	var itemQty = qty || 1;

	if (state.counter.value >= 120) {
		return {
			kind: "item",
			name: item_name,
			slug: d && d[0] || "",
			qty: itemQty,
			truncated: true,
			sources: []
		};
	}
	if (state.depth >= 8) {
		return {
			kind: "item",
			name: item_name,
			slug: d && d[0] || "",
			qty: itemQty,
			truncated: true,
			sources: []
		};
	}
	if (state.path.has(key)) {
		return {
			kind: "item",
			name: item_name,
			slug: d && d[0] || "",
			qty: itemQty,
			cycle: true,
			sources: []
		};
	}

	state.counter.value += 1;
	var nextPath = new Set(state.path);
	nextPath.add(key);
	return {
		kind: "item",
		name: item_name,
		slug: d[0] || "",
		qty: itemQty,
		tags: getItemTags(d, { includeRarity: true }),
		owned: getOwnedAmount(item_name),
		sources: await buildItemSourceBranches(item_name, d, {
			path: nextPath,
			counter: state.counter,
			depth: state.depth,
			requiredQty: itemQty
		})
	};
}

function wrapQuestChainLabel(text, width) {
	var words = String(text || "").split(/\s+/).filter(Boolean);
	if (!words.length) {
		return "";
	}
	var lines = [];
	var current = "";
	for (var i = 0; i < words.length; i++) {
		var next = current ? current + " " + words[i] : words[i];
		if (next.length > width && current) {
			lines.push(current);
			current = words[i];
		} else {
			current = next;
		}
	}
	if (current) {
		lines.push(current);
	}
	return lines.join("\n");
}

function getQuestChainNodeHref(data) {
	if (!data || !data.slug) {
		return "";
	}
	return wikiUrl(data.slug);
}

function buildQuestChainGraph(tree, selections) {
	var nodes = [];
	var edges = [];
	var detailMap = new Map();
	var choices = [];
	var idCounter = 0;
	var choiceMap = selections || {};

	function addNode(nodeDef, detail) {
		nodes.push(nodeDef);
		detailMap.set(nodeDef.id, detail);
		return nodeDef.id;
	}

	function addEdge(from, to, options) {
		edges.push(Object.assign({
			from: from,
			to: to,
			completeState: "missing",
			arrows: "to",
			color: {
				color: "rgba(255, 230, 184, 0.32)",
				highlight: "rgba(255, 230, 184, 0.78)",
				hover: "rgba(255, 230, 184, 0.62)"
			}
		}, options || {}));
	}

	function walkItem(node, parentId, pathKey, inheritedComplete) {
		var itemLabel = wrapQuestChainLabel(node.name, 20);
		if (node.qty && String(node.qty) !== "1") {
			itemLabel += "\nNeed " + node.qty;
		}
		var requiredQty = Math.max(1, parseInt(node.qty, 10) || 1);
		var ownedQty = typeof node.owned === "number" ? node.owned : null;
		var ownComplete = ownedQty !== null ? ownedQty >= requiredQty : false;
		var isComplete = !!inheritedComplete || ownComplete;
		var itemId = addNode({
			id: "item-" + (++idCounter),
			label: itemLabel,
			shape: "box",
			margin: 12,
			font: { color: "#fff4de", face: "Verdana", size: 16, bold: true },
			color: {
				background: parentId ? "#442134" : "#532743",
				border: "#e7c28f",
				highlight: { background: "#6a3154", border: "#ffe7b7" }
			},
			chosen: { node: false }
		}, {
			kind: "item",
			name: node.name,
			slug: node.slug,
			qty: node.qty,
			owned: node.owned,
			requiredQty: requiredQty,
			isComplete: isComplete,
			ownComplete: ownComplete,
			tags: node.tags || [],
			cycle: !!node.cycle,
			truncated: !!node.truncated,
			missing: !!node.missing
		});

		if (parentId) {
			addEdge(parentId, itemId, {
				completeState: isComplete ? "complete" : "missing"
			});
		}
		if (node.cycle || node.truncated || node.missing || !(node.sources || []).length) {
			return {
				id: itemId,
				complete: isComplete
			};
		}

		var itemKey = normalizeSlug(node.slug || normalize(node.name).replace(/\s+/g, "-")) || "item";
		var nextPath = pathKey + "/" + itemKey;
		var sourceIndexes = node.sources.map(function(_, index) { return index; });
		var sourceParentId = itemId;
		var orDetail = null;
		if (node.sources.length > 1) {
			var selectedIndex = parseInt(choiceMap[nextPath], 10);
			if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= node.sources.length) {
				selectedIndex = 0;
			}
			sourceIndexes = [selectedIndex];
			sourceParentId = addNode({
				id: "or-" + (++idCounter),
				label: "OR",
				shape: "diamond",
				size: 18,
				font: { color: "#fff4de", face: "Verdana", size: 12, bold: true },
				color: {
					background: "#7b2426",
					border: "#f1c29e",
					highlight: { background: "#973032", border: "#ffe7b7" }
				},
				chosen: { node: false }
			}, {
				kind: "or",
				name: "OR Path Split",
				meta: ["Choose one branch for this step."],
				isComplete: false
			});
			orDetail = detailMap.get(sourceParentId);
			choices.push({
				id: nextPath,
				nodeId: sourceParentId,
				label: node.name,
				options: node.sources.map(function(source, index) {
					return {
						value: String(index),
						label: (source.sourceType ? source.sourceType + ": " : "") + source.name
					};
				})
			});
		}

		var sourceResults = sourceIndexes.map(function(index) {
			return walkSource(node.sources[index], sourceParentId, nextPath + "/source-" + index, isComplete);
		});
		if (node.sources.length > 1) {
			var orComplete = isComplete || sourceResults.some(function(result) { return !!result.complete; });
			if (orDetail) {
				orDetail.isComplete = orComplete;
			}
			addEdge(itemId, sourceParentId, {
				length: 70,
				completeState: orComplete ? "complete" : "missing"
			});
		}
		return {
			id: itemId,
			complete: isComplete
		};
	}

	function walkSource(source, parentId, pathKey, inheritedComplete) {
		var sourceLabel = source.sourceType ? source.sourceType + "\n" : "";
		sourceLabel += wrapQuestChainLabel(source.name, 22);
		if (source.sourceType === "Quest") {
			if (source.rewardQty) {
				sourceLabel += "\nGives " + source.rewardQty;
			}
			if (source.requiredRuns) {
				sourceLabel += "\nDo " + source.requiredRuns + "x";
			}
		}
		var sourceId = addNode({
			id: "source-" + (++idCounter),
			label: sourceLabel,
			shape: "box",
			margin: 11,
			font: { color: "#fff4de", face: "Verdana", size: 14, bold: true },
			color: {
				background: source.sourceType === "Quest" ? "#3e243d" : source.sourceType === "Merge Shop" ? "#2f2a47" : "#3c1d31",
				border: "#ba9c7a",
				highlight: { background: "#5f3656", border: "#ffe7b7" }
			},
			chosen: { node: false }
		}, {
			kind: "source",
			name: source.name,
			slug: source.slug,
			sourceType: source.sourceType,
			meta: source.meta || [],
			direct: !(source.children || []).length,
			isComplete: !!inheritedComplete
		});
		var childResults = (source.children || []).map(function(child) {
			return walkItem(child, sourceId, pathKey, inheritedComplete);
		});
		var sourceComplete = !!inheritedComplete || (childResults.length ? childResults.every(function(result) {
			return !!result.complete;
		}) : false);
		var sourceDetail = detailMap.get(sourceId);
		if (sourceDetail) {
			sourceDetail.isComplete = sourceComplete;
		}
		addEdge(parentId, sourceId, {
			completeState: sourceComplete ? "complete" : "missing"
		});
		return {
			id: sourceId,
			complete: sourceComplete
		};
	}

	var rootResult = walkItem(tree, "", "root", false);
	var rootId = rootResult && rootResult.id;
	var adjacency = new Map();
	var depths = {};
	edges.forEach(function(edge) {
		if (!adjacency.has(edge.from)) {
			adjacency.set(edge.from, []);
		}
		adjacency.get(edge.from).push(edge.to);
	});
	if (rootId) {
		var queue = [{ id: rootId, depth: 0 }];
		var seen = new Set();
		while (queue.length) {
			var current = queue.shift();
			if (seen.has(current.id)) {
				continue;
			}
			seen.add(current.id);
			depths[current.id] = current.depth;
			(adjacency.get(current.id) || []).forEach(function(nextId) {
				queue.push({ id: nextId, depth: current.depth + 1 });
			});
		}
	}
	var maxDepth = 0;
	Object.keys(depths).forEach(function(nodeId) {
		if (depths[nodeId] > maxDepth) {
			maxDepth = depths[nodeId];
		}
	});
	return {
		nodes: nodes,
		edges: edges,
		detailMap: detailMap,
		choices: choices,
		rootId: rootId,
		depths: depths,
		maxDepth: maxDepth
	};
}

function computeQuestChainPresetPositions(graph) {
	var childrenByNode = new Map();
	(graph.edges || []).forEach(function(edge) {
		if (!childrenByNode.has(edge.from)) {
			childrenByNode.set(edge.from, []);
		}
		childrenByNode.get(edge.from).push(edge.to);
	});

	var detailById = graph.detailMap || new Map();
	var nextLeafY = 0;
	var positions = {};
	var leafGap = 190;
	var levelGap = 255;
	var startX = 120;
	var startY = 90;

	function subtreeGap(nodeId) {
		var detail = detailById.get(nodeId) || {};
		if (detail.kind === "or") {
			return 150;
		}
		if (detail.kind === "source" && detail.sourceType === "Quest") {
			return 205;
		}
		if (detail.kind === "item") {
			return 190;
		}
		return leafGap;
	}

	function place(nodeId, depth) {
		var children = childrenByNode.get(nodeId) || [];
		var x = startX + (depth * levelGap);
		var y;
		if (!children.length) {
			y = startY + nextLeafY;
			nextLeafY += subtreeGap(nodeId);
		} else {
			var childYs = children.map(function(childId) {
				return place(childId, depth + 1);
			});
			y = (Math.min.apply(null, childYs) + Math.max.apply(null, childYs)) / 2;
		}
		positions[nodeId] = { x: x, y: y };
		return y;
	}

	if (graph.rootId) {
		place(graph.rootId, 0);
	}
	return positions;
}

function renderQuestChainDetails(panel, detail) {
	var detailEl = panel.querySelector(".aqw-chain-details");
	if (!detailEl) {
		return;
	}
	if (!detail) {
		detailEl.innerHTML = "<div class='aqw-chain-hint'>Select a node to inspect that step, open its wiki page, or see whether it is an OR split, quest, merge shop, or final requirement.</div>";
		return;
	}

	var kicker = "Step";
	var meta = [];
	if (detail.kind === "item") {
		kicker = "Item";
		if (detail.qty && String(detail.qty) !== "1") {
			meta.push("Quantity needed: " + detail.qty);
		}
		if ((detail.tags || []).length) {
			meta.push("Tags: " + detail.tags.join(", "));
		}
		if (detail.cycle) {
			meta.push("Cycle detected on this branch.");
		}
		if (detail.truncated) {
			meta.push("Further dependencies were truncated here.");
		}
		if (detail.missing) {
			meta.push("No additional source data was available here.");
		}
	} else if (detail.kind === "source") {
		kicker = detail.sourceType || "Source";
		meta = (detail.meta || []).slice();
		if (detail.direct) {
			meta.push("Farm this source directly.");
		}
	} else if (detail.kind === "or") {
		kicker = "OR Split";
		meta = (detail.meta || []).slice();
	}

	var href = getQuestChainNodeHref(detail);
	var metaHtml = meta.length ? "<div class='aqw-chain-detail-meta'>" + meta.map(function(line) {
		return "<span>" + escapeHtml(line) + "</span>";
	}).join("") + "</div>" : "<div class='aqw-chain-hint'>No extra metadata for this node.</div>";
	detailEl.innerHTML = ""
		+ "<div class='aqw-chain-detail-kicker'>" + escapeHtml(kicker) + "</div>"
		+ "<div class='aqw-chain-detail-title'>" + escapeHtml(detail.name || "Quest Chain") + "</div>"
		+ metaHtml
		+ (href ? "<a class='aqw-chain-detail-link' href='" + escapeHtml(href) + "' target='_blank' rel='noreferrer'>Open Wiki Page</a>" : "");
}

async function applyQuestChainNodeImages(cy) {
	if (!cy || typeof getWikiImageVariants !== "function") {
		return false;
	}
	var nodes = cy.nodes().filter(function(node) {
		var detail = node.data("detail") || {};
		if (!node.data("href") || node.data("kind") === "or") {
			return false;
		}
		if (detail.kind === "item") {
			return true;
		}
		return detail.kind === "source" && detail.sourceType === "Drop";
	});
	var changed = false;
	await Promise.allSettled(nodes.map(async function(node) {
		var href = node.data("href");
		try {
			var variants = await getWikiImageVariants(href);
			var imageSrc = variants && variants[0];
			if (!imageSrc) {
				return;
			}
			node.style({
				"background-image": imageSrc,
				"background-fit": "contain",
				"background-repeat": "no-repeat",
				"background-width": "82%",
				"background-height": "70%",
				"background-position-y": "24%"
			});
			changed = true;
		} catch (err) {
			// Keep text-only nodes when art lookup fails.
		}
	}));
	return changed;
}

function sizeQuestChainGraphToContent(cy, graphEl) {
	if (!cy || !graphEl) {
		return;
	}
	var bounds = cy.elements().boundingBox();
	var minHeight = window.innerWidth <= 980 ? 460 : 620;
	var containerWidth = graphEl.clientWidth || (graphEl.parentElement && graphEl.parentElement.clientWidth) || 960;
	var rawHeight = Math.ceil((bounds.h || 0) + 180);
	var aspectRatio = (bounds.w && bounds.h) ? (bounds.w / Math.max(bounds.h, 1)) : 1;
	var widthCap = aspectRatio > 2.2
		? Math.ceil(containerWidth * 0.72)
		: aspectRatio > 1.4
			? Math.ceil(containerWidth * 1.05)
			: Math.ceil(containerWidth * 1.45);
	var hardCap = window.innerWidth <= 980 ? 1300 : 1650;
	var maxHeight = Math.max(minHeight, Math.min(widthCap, hardCap));
	var desiredHeight = Math.max(minHeight, Math.min(rawHeight, maxHeight));
	graphEl.style.height = desiredHeight + "px";
}

function fitQuestChainViewport(cy, graphEl) {
	if (!cy || !graphEl || !cy.elements || !cy.elements().length) {
		return;
	}
	var bounds = cy.elements().boundingBox();
	if (!bounds.w || !bounds.h) {
		return;
	}
	var width = graphEl.clientWidth || 0;
	var height = graphEl.clientHeight || 0;
	if (!width || !height) {
		return;
	}
	var marginX = 56;
	var marginY = 44;
	var zoomX = (width - (marginX * 2)) / bounds.w;
	var zoomY = (height - (marginY * 2)) / bounds.h;
	var targetZoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), Math.min(zoomX, zoomY, 1)));
	cy.zoom(targetZoom);
	cy.pan({
		x: marginX - (bounds.x1 * targetZoom),
		y: marginY - (bounds.y1 * targetZoom)
	});
}

function renderQuestChainChoiceOverlays(panel, cy, choices, selections, onChange) {
	var layer = panel.querySelector(".aqw-chain-choice-layer");
	if (!layer) {
		return;
	}
	if (!choices.length || !cy) {
		layer.innerHTML = "";
		return;
	}
		layer.innerHTML = choices.map(function(choice, idx) {
			var optionsHtml = choice.options.map(function(option) {
				var selected = String(selections[choice.id] || "0") === option.value ? " selected" : "";
				return "<option value='" + escapeHtml(option.value) + "'" + selected + ">" + escapeHtml(option.label) + "</option>";
			}).join("");
			return ""
				+ "<div class='aqw-chain-choice-node' data-choice-id='" + escapeHtml(choice.id) + "' data-node-id='" + escapeHtml(choice.nodeId) + "'>"
				+ "<select aria-label='" + escapeHtml(choice.label) + "'>" + optionsHtml + "</select>"
				+ "</div>";
		}).join("");

	Array.from(layer.querySelectorAll(".aqw-chain-choice-node")).forEach(function(nodeEl) {
		var choiceId = nodeEl.getAttribute("data-choice-id");
		var select = nodeEl.querySelector("select");
		select.addEventListener("change", function() {
			onChange(choiceId, select.value);
		});
	});
	positionQuestChainChoiceOverlays(panel, cy);
}

function renderQuestChainStatusOverlays(panel, cy, detailMap) {
	var layer = panel.querySelector(".aqw-chain-status-layer");
	if (!layer) {
		return;
	}
	if (!cy || !detailMap) {
		layer.innerHTML = "";
		return;
	}
	var html = [];
	cy.nodes().forEach(function(node) {
		var detail = detailMap.get(node.id()) || {};
		if (detail.kind !== "item" || typeof detail.owned !== "number") {
			return;
		}
		var requiredQty = Math.max(1, parseInt(detail.requiredQty || detail.qty, 10) || 1);
		var complete = !!detail.isComplete;
		html.push(
			"<div class='aqw-chain-status-badge " + (complete ? "is-complete" : "is-missing") + "' data-node-id='" + escapeHtml(node.id()) + "'>"
			+ "Have " + escapeHtml(String(detail.owned)) + (requiredQty > 1 ? " / " + escapeHtml(String(requiredQty)) : "")
			+ "</div>"
		);
	});
	layer.innerHTML = html.join("");
	positionQuestChainStatusOverlays(panel, cy);
}

function getQuestChainStatusOverlayScale(cyNode) {
	if (!cyNode || !cyNode.length) {
		return 1;
	}
	var box = cyNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
	return (box.h || 156) / 156;
}

function getQuestChainChoiceOverlayScale(cyNode) {
	if (!cyNode || !cyNode.length) {
		return 1;
	}
	var box = cyNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
	return (box.h || 44) / 44;
}

function positionQuestChainStatusOverlays(panel, cy) {
	var layer = panel.querySelector(".aqw-chain-status-layer");
	if (!layer || !cy) {
		return;
	}
	Array.from(layer.querySelectorAll(".aqw-chain-status-badge")).forEach(function(badgeEl) {
		var nodeId = badgeEl.getAttribute("data-node-id");
		var cyNode = cy.$id(nodeId);
		if (!cyNode || !cyNode.length) {
			return;
		}
		var box = cyNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
		var scale = getQuestChainStatusOverlayScale(cyNode);
		badgeEl.style.left = (box.x1 + (box.w / 2)) + "px";
		badgeEl.style.top = (box.y2 - (10 * scale)) + "px";
		badgeEl.style.transform = "translate(-50%, -50%) scale(" + scale + ")";
	});
}

function positionQuestChainChoiceOverlays(panel, cy) {
	var layer = panel.querySelector(".aqw-chain-choice-layer");
	if (!layer || !cy) {
		return;
	}
	Array.from(layer.querySelectorAll(".aqw-chain-choice-node")).forEach(function(nodeEl) {
		var nodeId = nodeEl.getAttribute("data-node-id");
		var cyNode = cy.$id(nodeId);
		if (!cyNode || !cyNode.length) {
			return;
		}
		var box = cyNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
		var scale = getQuestChainChoiceOverlayScale(cyNode);
		nodeEl.style.left = (box.x1 + (box.w / 2)) + "px";
		nodeEl.style.top = (box.y2 + (28 * scale)) + "px";
		nodeEl.style.transform = "translate(-50%, -50%) scale(" + scale + ")";
	});
}

function scheduleQuestChainChoiceOverlayPosition(panel, cy) {
	if (!panel || !cy) {
		return;
	}
	if (panel._choiceOverlayFrame) {
		return;
	}
	panel._choiceOverlayFrame = requestAnimationFrame(function() {
		panel._choiceOverlayFrame = 0;
		positionQuestChainChoiceOverlays(panel, cy);
		positionQuestChainStatusOverlays(panel, cy);
	});
}

function scheduleQuestChainViewportUpdate(panel, cy, graphEl, resizeToContent) {
	if (!panel || !cy || !graphEl) {
		return;
	}
	if (resizeToContent) {
		panel._questChainNeedsResize = true;
	}
	if (panel._questChainViewportFrame) {
		return;
	}
		panel._questChainViewportFrame = requestAnimationFrame(function() {
			panel._questChainViewportFrame = 0;
			if (panel._questChainNeedsResize) {
				panel._questChainNeedsResize = false;
				sizeQuestChainGraphToContent(cy, graphEl);
				cy.resize();
			}
			positionQuestChainChoiceOverlays(panel, cy);
			positionQuestChainStatusOverlays(panel, cy);
		});
}

function ensureQuestChainPanel(button, item_name) {
	var panel = document.getElementById("aqw-chain-panel");
	if (!panel) {
		panel = document.createElement("section");
		panel.id = "aqw-chain-panel";
		panel.className = "aqw-chain-panel";
		panel.hidden = true;
		panel.innerHTML = ""
			+ "<div class='aqw-chain-panel-header'>"
			+ "<div><div class='aqw-chain-title'>Quest Chain</div><div class='aqw-chain-subtitle'></div></div>"
			+ "<div class='aqw-chain-actions'>"
			+ "<button type='button' class='aqw-chain-action' data-action='fit'>Fit Graph</button>"
			+ "<button type='button' class='aqw-chain-action' data-action='hide'>Hide</button>"
			+ "</div>"
			+ "</div>"
			+ "<div class='aqw-chain-body'>"
				+ "<div class='aqw-chain-legend'>"
				+ "<span><i class='aqw-chain-dot' style='background:#532743'></i>Target / required item</span>"
				+ "<span><i class='aqw-chain-dot' style='background:#3e243d'></i>Quest step</span>"
				+ "<span><i class='aqw-chain-dot' style='background:#2f2a47'></i>Merge shop</span>"
				+ "</div>"
				+ "<div class='aqw-chain-graph-wrap'><div class='aqw-chain-graph'></div><div class='aqw-chain-status-layer'></div><div class='aqw-chain-choice-layer'></div></div>"
				+ "<div class='aqw-chain-hint'>Click an item, NPC, monster, quest, or shop node to open its wiki page in a new tab.</div>"
				+ "</div>";
		button.insertAdjacentElement("afterend", panel);
		panel.querySelector("[data-action='hide']").addEventListener("click", function() {
			panel.hidden = true;
			button.textContent = "Quest Chain";
		});
			panel.querySelector("[data-action='fit']").addEventListener("click", function() {
				if (panel._cy) {
					var graphEl = panel.querySelector(".aqw-chain-graph");
					sizeQuestChainGraphToContent(panel._cy, graphEl);
					panel._cy.resize();
					fitQuestChainViewport(panel._cy, graphEl);
					scheduleQuestChainViewportUpdate(panel, panel._cy, graphEl, false);
				}
			});
	}
	panel.querySelector(".aqw-chain-subtitle").textContent = item_name;
	return panel;
}

function captureQuestChainViewport(cy) {
	if (!cy) {
		return null;
	}
	return {
		zoom: cy.zoom(),
		pan: Object.assign({}, cy.pan())
	};
}

function restoreQuestChainViewport(cy, viewport) {
	if (!cy || !viewport) {
		return false;
	}
	if (typeof viewport.zoom === "number") {
		cy.zoom(viewport.zoom);
	}
	if (viewport.pan) {
		cy.pan(viewport.pan);
	}
	return true;
}

async function renderQuestChainInline(button, item_name, d, forceOpen) {
	ensureQuestChainUi();
	var panel = ensureQuestChainPanel(button, item_name);
	if (!forceOpen && !panel.hidden && panel.dataset.itemSlug === String(d[0] || "")) {
		panel.hidden = true;
		button.textContent = "Quest Chain";
		return;
	}
	panel.hidden = false;
	button.textContent = "Hide Quest Chain";
	panel.dataset.itemSlug = String(d[0] || "");
	panel.querySelector(".aqw-chain-graph").innerHTML = "";
	panel.querySelector(".aqw-chain-graph").style.height = "";
	var hintEl = panel.querySelector(".aqw-chain-hint");
	if (hintEl) {
		hintEl.textContent = "Building dependency graph...";
	}

	var cytoscapeLib = (typeof window !== "undefined" && window.cytoscape) || (typeof self !== "undefined" && self.cytoscape) || (typeof globalThis !== "undefined" && globalThis.cytoscape);
	if (!cytoscapeLib) {
		if (hintEl) {
			hintEl.textContent = "Graph library failed to load.";
		}
		return;
	}

	await ensureQuestChainDataReady();
	await ensureQuestChainAccountDataReady();
	try {
		var itemSlug = String(d[0] || "");
		var tree = panel._questChainTree;
		if (!tree || panel.dataset.itemSlug !== itemSlug) {
			tree = await buildQuestChainTree(item_name, d, 1);
			panel._questChainTree = tree;
			panel._orSelections = {};
		}
		var selections = panel._orSelections || {};
		panel._orSelections = selections;
			var graph = buildQuestChainGraph(tree, selections);
			var presetPositions = computeQuestChainPresetPositions(graph);
			graph.choices.forEach(function(choice) {
				if (typeof selections[choice.id] === "undefined") {
					selections[choice.id] = "0";
				}
		});
		var graphEl = panel.querySelector(".aqw-chain-graph");
		if (panel._cy) {
			panel._cy.destroy();
		}
		var elements = [];
			graph.nodes.forEach(function(node) {
				var detail = graph.detailMap.get(node.id) || {};
				elements.push({
						data: {
						id: node.id,
						label: node.label,
						kind: detail.kind || "step",
						depth: graph.depths[node.id] || 0,
						completeState: detail.isComplete ? "complete" : "missing",
						sourceType: detail.sourceType || "",
						imageCapable: detail.kind === "item" || (detail.kind === "source" && detail.sourceType === "Drop") ? "true" : "false",
						href: getQuestChainNodeHref(detail),
						detail: detail
					},
					position: presetPositions[node.id]
				});
			});
		graph.edges.forEach(function(edge, index) {
					elements.push({
						data: {
							id: "edge-" + index,
							source: edge.from,
							target: edge.to,
							completeState: edge.completeState || "missing"
						}
					});
				});

		var cy = cytoscapeLib({
			container: graphEl,
			elements: elements,
				wheelSensitivity: 1.4,
			boxSelectionEnabled: false,
			autounselectify: true,
			textureOnViewport: true,
			motionBlur: true,
			hideEdgesOnViewport: true,
			pixelRatio: 1,
				style: [
					{
						selector: "node",
						style: {
						"shape": "round-rectangle",
						"background-color": "rgba(88, 41, 75, 0.92)",
						"border-width": 1,
						"border-color": "#c1a29d",
						"color": "#fff7ef",
						"text-wrap": "wrap",
						"text-max-width": "142px",
						"label": "data(label)",
							"font-size": "14px",
							"font-weight": "700",
							"text-valign": "center",
							"text-halign": "center",
							"padding": "12px",
							"width": 148,
						"height": 124,
						"text-outline-width": 1,
						"text-outline-color": "rgba(52,20,42,0.65)"
						}
					},
					{
						selector: "node[imageCapable = 'true']",
						style: {
							"text-valign": "bottom",
							"text-margin-y": "16px",
							"width": 160,
							"height": 156,
							"font-size": "13px",
							"text-max-width": "138px"
						}
					},
					{
						selector: "node[completeState = 'complete']",
						style: {
							"border-color": "#63d85d",
							"border-width": 4,
							"shadow-blur": 28,
							"shadow-opacity": 0.72,
							"shadow-color": "#63d85d",
							"underlay-color": "#63d85d",
							"underlay-opacity": 0.22,
							"underlay-padding": 7
						}
					},
					{
						selector: "node[completeState = 'missing']",
						style: {
							"border-color": "#d24a59",
							"border-width": 3,
							"shadow-blur": 20,
							"shadow-opacity": 0.55,
							"shadow-color": "#b33a44"
						}
					},
					{
						selector: "node[kind = 'source']",
						style: {
							"background-color": "rgba(69, 36, 59, 0.9)",
							"border-color": "#ba9c7a",
						"width": 156,
						"height": 112
					}
				},
				{
					selector: "node[kind = 'or']",
					style: {
						"shape": "diamond",
						"background-color": "#7b2426",
						"border-color": "#f1c29e",
						"font-size": "12px",
						"padding": "10px",
						"width": 44,
						"height": 44,
						"text-outline-width": 0
					}
				},
					{
						selector: "edge",
						style: {
							"width": 2,
							"curve-style": "bezier",
							"line-color": "rgba(148, 80, 94, 0.45)",
							"target-arrow-shape": "triangle",
							"target-arrow-color": "rgba(148, 80, 94, 0.45)"
						}
					},
					{
						selector: "edge[completeState = 'complete']",
						style: {
							"width": 3,
							"line-color": "rgba(99, 216, 93, 0.88)",
							"target-arrow-color": "rgba(99, 216, 93, 0.88)"
						}
					},
					{
						selector: "edge[completeState = 'missing']",
						style: {
							"width": 2.4,
							"line-color": "rgba(188, 84, 96, 0.72)",
							"target-arrow-color": "rgba(188, 84, 96, 0.72)"
						}
					}
			],
				layout: {
					name: "preset",
					fit: false,
					padding: 20
				},
			minZoom: 0.25,
			maxZoom: 2.2
		});

			panel._cy = cy;
			panel._graphDetails = graph.detailMap;
		cy.on("tap", "node", function(evt) {
			var detail = graph.detailMap.get(evt.target.id()) || null;
			var href = getQuestChainNodeHref(detail);
			if (href) {
				window.open(href, "_blank", "noopener");
			}
		});
			if (hintEl) {
				hintEl.textContent = "Click a node to open its wiki page. Drag to move the graph, scroll to zoom, or use Fit Graph to see the full chain.";
			}
				renderQuestChainStatusOverlays(panel, cy, graph.detailMap);
				renderQuestChainChoiceOverlays(panel, cy, graph.choices, panel._orSelections || {}, function(choiceId, value) {
					panel._savedViewport = captureQuestChainViewport(panel._cy);
					panel._orSelections[choiceId] = value;
					renderQuestChainInline(button, item_name, d, true);
				});
			var viewportFinalized = false;
			function finalizeViewport() {
				if (viewportFinalized) {
					return;
				}
					viewportFinalized = true;
					sizeQuestChainGraphToContent(cy, graphEl);
					cy.resize();
					if (!restoreQuestChainViewport(cy, panel._savedViewport)) {
						fitQuestChainViewport(cy, graphEl);
					}
					panel._savedViewport = null;
					scheduleQuestChainViewportUpdate(panel, cy, graphEl, false);
				}
			cy.one("layoutstop", finalizeViewport);
			requestAnimationFrame(finalizeViewport);
			scheduleQuestChainViewportUpdate(panel, cy, graphEl, false);
			cy.on("pan zoom resize", function() {
				scheduleQuestChainViewportUpdate(panel, cy, graphEl, false);
			});
			cy.on("drag position", "node", function() {
				scheduleQuestChainViewportUpdate(panel, cy, graphEl, true);
			});
			cy.on("position free", "node[kind = 'or']", function() {
				scheduleQuestChainViewportUpdate(panel, cy, graphEl, false);
			});
			cy.on("free", "node", function() {
				scheduleQuestChainViewportUpdate(panel, cy, graphEl, true);
			});
			applyQuestChainNodeImages(cy).then(function(changed) {
				if (!panel._cy || panel._cy !== cy || !changed) {
					return;
				}
				scheduleQuestChainViewportUpdate(panel, cy, graphEl, true);
			});
			panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
		} catch (err) {
		if (hintEl) {
			hintEl.textContent = "Failed to build dependency graph.";
		}
	}
}

function initWikiQuestChainFeature(contentEl) {
	if (!contentEl || window.location.href.includes("tofarm.html") || document.getElementById("aqw-chain-launch")) {
		return;
	}
	var entry = getCurrentWikiItemEntry();
	if (!entry) {
		return;
	}
	var item_name = entry[0];
	var d = entry[1];
	var price = readDetail(d, "Price") || [];
	if (!price.length || price[0] !== "Merge") {
		return;
	}
	var mount = findQuestChainMount(contentEl, price[0]);
	if (!mount) {
		return;
	}
	ensureQuestChainUi();
	var button = document.createElement("button");
	button.id = "aqw-chain-launch";
	button.type = "button";
	button.className = "aqw-chain-launch";
	button.textContent = "Quest Chain";
	button.addEventListener("click", function() {
		renderQuestChainInline(button, item_name, d);
	});
	mount.insertAdjacentElement("afterend", button);
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

function ownershipIconHtml(badge) {
	if (badge === "In Bank") {
		return "<img class='card-state-icon' src='" + escapeHtml(in_bank_icon) + "' alt='In Bank' title='In Bank'>";
	}
	if (badge === "In Inv") {
		return "<img class='card-state-icon' src='" + escapeHtml(in_inventory_icon) + "' alt='In Inventory' title='In Inventory'>";
	}
	return "";
}

function buildCardImageWrap(wikiUrlValue, altText, tagHtml, stateHtml) {
	return ""
		+ "<div class='card-image-wrap'>"
		+ (stateHtml || "")
		+ "<div class='card-image-gallery'>"
		+ "<canvas class='card-img planner-card-canvas' data-image-state='loading' hidden></canvas>"
		+ "<img class='card-img planner-card-image' src='" + EMPTY_IMAGE_SRC + "' data-image-state='loading' data-wiki-url='" + escapeHtml(wikiUrlValue) + "' alt='" + escapeHtml(altText) + "'>"
		+ "</div>"
		+ "<div class='card-tag-stack'>" + (tagHtml || "") + "</div>"
		+ "</div>";
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
		+ buildCardImageWrap(wikiUrl(item_details[0]), item_name, tagOverlayHtml(tags), "")
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
		+ buildCardImageWrap(wikiUrl(slug), name, tagOverlayHtml(tags || []), ownershipIconHtml(badge))
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

function buildSectionProgressHtml(completedCount, totalCount, accentClass) {
	var safeTotal = totalCount || 0;
	var pct = safeTotal ? Math.round((completedCount / safeTotal) * 100) : 0;
	return ""
		+ "<div class='completed-section-progress'>"
		+ "<div class='completed-mini-pie " + escapeHtml(accentClass || "") + "' style='--pie-pct:" + pct + "%;'><div class='completed-mini-pie-center'>" + pct + "%</div></div>"
		+ "<div class='completed-section-progress-copy'>" + escapeHtml(completedCount + " / " + safeTotal) + "</div>"
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
		var ingredients = (item.ingredients || []).map(buildMergeIngredientChip).join("");
		return ""
			+ "<div class='item-card' data-item-name='" + escapeHtml(item.name) + "' data-slug='" + escapeHtml(normalizeSlug(item.slug)) + "'>"
			+ "<span class='card-badge needed'>To Acquire</span>"
			+ buildCardImageWrap(wikiUrl(item.slug), item.name, tagOverlayHtml(item.tags), "")
			+ "<div class='card-body'>"
			+ "<div class='card-name'>" + escapeHtml(item.name) + "</div>"
			+ (ingredients ? "<div class='planner-chip-row' style='margin-top:8px;'>" + ingredients + "</div>" : "")
			+ "</div></div>";
	}).join("");

	var ownedHtml = shop.owned.map(function(item) {
		return ""
			+ "<div class='item-card' data-item-name='" + escapeHtml(item.name) + "' data-slug='" + escapeHtml(normalizeSlug(item.slug)) + "'>"
			+ "<span class='card-badge owned'>Owned</span>"
			+ buildCardImageWrap(wikiUrl(item.slug), item.name, tagOverlayHtml(item.tags), "")
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
			+ buildCardImageWrap(wikiUrl(item.slug), item.name, tagOverlayHtml(item.tags), "")
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
			+ buildCardImageWrap(wikiUrl(item.slug), item.name, tagOverlayHtml(item.tags), "")
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
	var wrap = document.getElementById("completed-wrap");
	wrap.innerHTML = "";

	var completedMerge = [];
	var completedQuest = [];
	var totalEligibleMerge = 0;
	var totalEligibleQuest = 0;
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
			return true;
		});
		if (!items.length) {
			return;
		}
		if (matchSearch([shop.name, shop.npc && shop.npc.name, shop.location && shop.location.name])) {
			totalEligibleMerge += 1;
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
				return true;
			});
			if (rewards.length && rewards.every(function(reward) { return isOwned(reward.name); }) && matchSearch([quest.name, page.npc && page.npc.name, page.location && page.location.name])) {
				completedQuest.push({
					page: page,
					quest: quest,
					rewards: rewards
				});
			}
			if (rewards.length && matchSearch([quest.name, page.npc && page.npc.name, page.location && page.location.name])) {
				totalEligibleQuest += 1;
			}
		});
	});

	Object.entries(items_json || {}).forEach(function(entry) {
		var itemName = entry[0];
		var details = entry[1];
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
		sections.push("<div class='completed-section'><div class='completed-section-header'><div class='completed-section-title'>Completed Item Merge Shops</div>" + buildSectionProgressHtml(completedMerge.length, totalEligibleMerge, "ac") + "</div>" + completedMerge.map(function(shop) {
			return "<div class='req-sub'><a href='" + escapeHtml(wikiUrl(shop.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(shop.name) + "</a></div>";
		}).join("") + "</div>");
	}
	if (completedQuest.length) {
		sections.push("<div class='completed-section'><div class='completed-section-header'><div class='completed-section-title'>Completed Item Quests</div>" + buildSectionProgressHtml(completedQuest.length, totalEligibleQuest, "ac-seasonal") + "</div>" + completedQuest.map(function(row) {
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
		promise = getWikiImageVariants(wikiUrlValue).then(function(images) {
			return images && images[0] ? images[0] : "";
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

function getWikiImageVariants(wikiUrlValue) {
	if (!wikiUrlValue || typeof window._wikimg !== "function") {
		return Promise.resolve([]);
	}
	if (_imageVariantCache.has(wikiUrlValue)) {
		return _imageVariantCache.get(wikiUrlValue);
	}
	var promise = window._wikimg(wikiUrlValue).then(function(images) {
		return (Array.isArray(images) ? images : []).filter(Boolean);
	}).catch(function() {
		return [];
	});
	_imageVariantCache.set(wikiUrlValue, promise);
	return promise;
}

function setModalImageTabState(activeIndex) {
	document.querySelectorAll("[data-modal-variant]").forEach(function(btn) {
		btn.classList.toggle("active", String(activeIndex) === btn.dataset.modalVariant);
	});
}

function showModalImageVariant(variants, index) {
	var modalImage = document.getElementById("modal-image");
	var src = variants[index] || variants[0] || "";
	if (src) {
		modalImage.src = src;
		modalImage.dataset.imageState = "loaded";
	} else {
		modalImage.src = MISSING_IMAGE_SRC;
		modalImage.dataset.imageState = "missing";
	}
	setModalImageTabState(index);
}

async function setupModalImageVariants(wikiUrlValue) {
	var modalImage = document.getElementById("modal-image");
	var tabWrap = document.getElementById("modal-image-tabs");
	if (!tabWrap) {
		return;
	}
	tabWrap.hidden = true;
	tabWrap.innerHTML = "";
	modalImage.src = EMPTY_IMAGE_SRC;
	modalImage.dataset.imageState = "loading";

	var variants = await getWikiImageVariants(wikiUrlValue);
	if (!variants.length) {
		modalImage.src = MISSING_IMAGE_SRC;
		modalImage.dataset.imageState = "missing";
		return;
	}

	showModalImageVariant(variants, 0);
	if (variants.length < 2) {
		return;
	}

	var labels = variants.length === 2 ? ["Male", "Female"] : variants.map(function(_, idx) { return "Variant " + (idx + 1); });
	tabWrap.innerHTML = variants.map(function(_, idx) {
		return "<button type='button' class='modal-image-tab' data-modal-variant='" + idx + "'>" + escapeHtml(labels[idx]) + "</button>";
	}).join("");
	tabWrap.hidden = false;
	setModalImageTabState(0);
	tabWrap.querySelectorAll("[data-modal-variant]").forEach(function(btn) {
		btn.addEventListener("click", function() {
			showModalImageVariant(variants, parseInt(btn.dataset.modalVariant, 10) || 0);
		});
	});
}

function loadCardImages() {
	var targets = document.querySelectorAll(".card-image-wrap");
	targets.forEach(function(wrap) {
		if (wrap.closest(".owned-collapsed") && !wrap.closest(".owned-collapsed").classList.contains("active")) {
			return;
		}
		if (wrap.dataset.loaded === "true") {
			return;
		}
		wrap.dataset.loaded = "true";
		loadCardImageSet(wrap);
	});
}

async function loadCardImageSet(wrap) {
	var primary = wrap.querySelector(".planner-card-image");
	var canvas = wrap.querySelector(".planner-card-canvas");
	if (!primary) {
		return;
	}

	var wikiUrlValue = primary.dataset.wikiUrl;
	var gallery = wrap.querySelector(".card-image-gallery");
	primary.hidden = false;
	primary.dataset.imageState = "loading";
	primary.src = EMPTY_IMAGE_SRC;
	if (canvas) {
		canvas.hidden = true;
		canvas.dataset.imageState = "loading";
	}
	if (gallery) {
		gallery.classList.remove("stitched");
	}

	var variants = await getWikiImageVariants(wikiUrlValue);
	if (!variants.length) {
		primary.src = MISSING_IMAGE_SRC;
		primary.dataset.imageState = "missing";
		return;
	}

	primary.src = variants[0];
	primary.dataset.imageState = "loaded";
	if (canvas && variants[1]) {
		renderStitchedCardImage(variants[0], variants[1]).then(function(stitched) {
			if (!stitched) {
				return;
			}
			canvas.hidden = false;
			canvas.dataset.imageState = "loaded";
			canvas.style.backgroundImage = "url('" + stitched + "')";
			canvas.style.backgroundSize = "100% 100%";
			canvas.style.backgroundRepeat = "no-repeat";
			primary.hidden = true;
			if (gallery) {
				gallery.classList.add("stitched");
			}
		}).catch(function() {
			// Keep the primary image visible if stitched rendering fails.
		});
	}
}

function loadImageElement(src) {
	return new Promise(function(resolve) {
		if (!src) {
			resolve(null);
			return;
		}
		var img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = function() { resolve(img); };
		img.onerror = function() { resolve(null); };
		img.src = src;
	});
}

async function renderStitchedCardImage(leftSrc, rightSrc) {
	var left = await loadImageElement(leftSrc);
	var right = await loadImageElement(rightSrc);
	if (!left || !right) {
		return "";
	}

	var size = 320;
	var half = size / 2;
	var canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	var ctx = canvas.getContext("2d");
	if (!ctx) {
		return "";
	}

	ctx.fillStyle = "#1f1c28";
	ctx.fillRect(0, 0, size, size);
	drawContainImage(ctx, left, 0, 0, half, size);
	drawContainImage(ctx, right, half, 0, half, size);
	try {
		return canvas.toDataURL("image/png");
	} catch (err) {
		return "";
	}
}

function drawContainImage(ctx, img, x, y, width, height) {
	var scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
	var drawWidth = img.naturalWidth * scale;
	var drawHeight = img.naturalHeight * scale;
	var dx = x + (width - drawWidth) / 2;
	var dy = y + (height - drawHeight) / 2;
	ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
}

function openItemModal(item_name, d) {
	var modal = document.getElementById("item-modal");
	var tags = getItemTags(d);
	document.getElementById("modal-title").textContent = item_name;
	document.getElementById("modal-tags").innerHTML = tagChipsHtml(tags);
	document.getElementById("modal-image").dataset.wikiUrl = wikiUrl(d[0]);
	setupModalImageVariants(wikiUrl(d[0]));
	document.getElementById("modal-slug").textContent = d[0];
	document.getElementById("modal-wiki-link").href = wikiUrl(d[0]);

	document.getElementById("modal-description").innerHTML = "<span class='modal-label'>Description</span><div class='modal-value modal-description-box'>" + escapeHtml(readDetail(d, "Description") || "N/A") + "</div>";
	document.getElementById("modal-price").innerHTML = renderModalPrice(readDetail(d, "Price"));
	document.getElementById("modal-sellback").innerHTML = renderModalSellback(readDetail(d, "Sellback"));
	document.getElementById("modal-location").innerHTML = renderModalLocation(readDetail(d, "Location"));
	document.getElementById("modal-requirements").innerHTML = renderModalRequirements(item_name, d);

	var modalFlagsEl = document.getElementById("modal-flags");
	var flags = [];
	["Rare", "Pseudo Rare", "Special Offer", "Beta", "Color Custom", "Custom Animation"].forEach(function(flag) {
		if (readFlag(d, flag)) {
			flags.push(flag);
		}
	});
	if (flags.length) {
		modalFlagsEl.hidden = false;
		modalFlagsEl.innerHTML = "<span class='modal-label'>Flags</span><div class='modal-value'>" + escapeHtml(flags.join(", ")) + "</div>";
	} else {
		modalFlagsEl.hidden = true;
		modalFlagsEl.innerHTML = "";
	}
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
		return "";
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

function buildModalRequirementRow(title, href, metaHtml, extraHtml) {
	var tagName = href ? "a" : "div";
	var attrHtml = href ? " class='modal-req-item' href='" + escapeHtml(href) + "' target='_blank' rel='noreferrer'" : " class='modal-req-item'";
	return "<" + tagName + attrHtml + ">"
		+ "<span class='modal-req-main'>" + escapeHtml(title) + "</span>"
		+ (metaHtml ? "<span class='modal-req-meta'>" + metaHtml + "</span>" : "")
		+ (extraHtml ? "<span class='modal-req-extra'>" + extraHtml + "</span>" : "")
		+ "</" + tagName + ">";
}

function renderMergeRequirements(el, d) {
	var price = readDetail(d, "Price") || [];
	var ingredients = price[3] || [];
	if (!ingredients.length) {
		el.innerHTML = "<div class='modal-value'>None</div>";
		return;
	}
	el.innerHTML = "<div class='modal-req-list'>" + ingredients.map(function(ing) {
		var owned = getOwnedAmount(ing[0]);
		var required = parseInt(ing[2], 10) || 0;
		var ownedClass = owned >= required ? " met" : "";
		var extra = ""
			+ "<span class='modal-req-pill owned" + ownedClass + "'>Owned " + escapeHtml(String(owned)) + "</span>"
			+ "<span class='modal-req-pill need'>Need " + escapeHtml(String(ing[2])) + "</span>";
		return buildModalRequirementRow(ing[0], ing[1] ? wikiUrl(ing[1]) : "", "", extra);
	}).join("") + "</div>";
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
	el.innerHTML = "<div class='modal-req-list'>" + matches.map(function(match) {
		var meta = [];
		if (match.page.npc && match.page.npc.name) {
			meta.push("NPC: " + escapeHtml(match.page.npc.name));
		}
		if (match.page.location && match.page.location.name) {
			meta.push("Location: " + escapeHtml(match.page.location.name));
		}
		return buildModalRequirementRow(match.quest.name, wikiUrl(match.page.slug), meta.join(" · "), "");
	}).join("") + "</div>";
}

function renderDropInfo(el, d) {
	var price = readDetail(d, "Price") || [];
	if (!price.length) {
		el.innerHTML = "<div class='modal-value'>N/A</div>";
		return;
	}
	if (Array.isArray(price[1])) {
		el.innerHTML = "<div class='modal-req-list'>" + price.slice(1).map(function(source) {
			return buildModalRequirementRow(source[1], wikiUrl(source[0]), "", "");
		}).join("") + "</div>";
		return;
	}
	var monsterName = price[1] || "";
	var monsterSlug = price[2] || "";
	if (monsterSlug) {
		el.innerHTML = "<div class='modal-req-list'>" + buildModalRequirementRow(monsterName, wikiUrl(monsterSlug), "", "") + "</div>";
		return;
	}
	el.innerHTML = "<div class='modal-req-list'>" + buildModalRequirementRow(monsterName, "", "", "") + "</div>";
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
			aqwtype: [],
			tofarmGridSize: "medium"
		}, function(result) {
			_accountItems = (result.aqwitems || []).map(function(item) { return normalize(item); });
			_accountWhere = result.aqwwhere || [];
			_accountType = result.aqwtype || [];
			_accountCountLookup = null;
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
