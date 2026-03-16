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
	return parseQuestSectionItems(container, "Items").map(function(item) {
		return {
			name: item.name,
			slug: item.slug,
			qty: item.qty
		};
	});
}

function parseQuestSectionMeta(nodes) {
	var location = null;
	var npc = null;
	var requirementsNote = "";

	nodes.forEach(function(node) {
		var text = (node.textContent || "").replace(/\s+/g, " ").trim();
		if (!text) {
			return;
		}
		if (!location && /^Quest Location/i.test(text)) {
			var locationLink = node.querySelector("a[href]");
			if (locationLink) {
				location = {
					name: (locationLink.textContent || "").trim(),
					slug: locationLink.getAttribute("href") || ""
				};
			}
		}
		if (!location && /^Quest Locations/i.test(text)) {
			var locationList = node.nextElementSibling && node.nextElementSibling.tagName === "UL" ? node.nextElementSibling : node;
			var locationAnchor = locationList.querySelector("a[href]");
			if (locationAnchor) {
				location = {
					name: (locationAnchor.textContent || "").trim(),
					slug: locationAnchor.getAttribute("href") || ""
				};
			}
		}
		if (!npc && /^Quests Begun From/i.test(text)) {
			var npcLink = node.querySelector("a[href]");
			if (npcLink) {
				npc = {
					name: (npcLink.textContent || "").trim(),
					slug: npcLink.getAttribute("href") || ""
				};
			}
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
		+ ".aqw-chain-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(9,7,13,0.76);z-index:10000;padding:24px;}"
		+ ".aqw-chain-overlay.active{display:flex;}"
		+ ".aqw-chain-dialog{width:min(1120px,96vw);max-height:88vh;overflow:auto;background:#5a2e49;border:1px solid rgba(255,231,185,0.12);color:#f2eadf;box-shadow:0 18px 48px rgba(0,0,0,0.38);}"
		+ ".aqw-chain-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(255,231,185,0.1);}"
		+ ".aqw-chain-title{font-size:1.3rem;font-weight:800;color:#fff4de;}"
		+ ".aqw-chain-subtitle{margin-top:4px;color:#eadcc8;}"
		+ ".aqw-chain-close{border:none;background:none;color:#fff4de;cursor:pointer;font-size:32px;line-height:1;}"
		+ ".aqw-chain-body{padding:20px;}"
		+ ".aqw-chain-empty,.aqw-chain-loading{padding:18px 20px;color:#f2eadf;}"
		+ ".aqw-chain-tree{display:flex;flex-direction:column;gap:14px;}"
		+ ".aqw-chain-node{display:flex;flex-direction:column;gap:10px;}"
		+ ".aqw-chain-card{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid rgba(255,231,185,0.1);border-radius:2px;background:rgba(68,24,50,0.24);}"
		+ ".aqw-chain-card.root{background:#442134;border-color:rgba(255,231,185,0.16);}"
		+ ".aqw-chain-card.source{background:#3c1d31;}"
		+ ".aqw-chain-kicker{font-size:0.74rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#d7c4cf;}"
		+ ".aqw-chain-main{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}"
		+ ".aqw-chain-main a,.aqw-chain-main span{color:#fff4de;font-weight:800;text-decoration:none;}"
		+ ".aqw-chain-main a:hover{text-decoration:underline;}"
		+ ".aqw-chain-pill{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border-radius:2px;background:rgba(255,231,185,0.1);color:#fff4de;font-size:0.74rem;font-weight:800;}"
		+ ".aqw-chain-pill.or{background:#8f2021;color:#fff4de;}"
		+ ".aqw-chain-meta{color:#eadcc8;font-size:0.86rem;line-height:1.45;}"
		+ ".aqw-chain-children{margin-left:18px;padding-left:18px;border-left:1px solid rgba(255,231,185,0.18);display:flex;flex-direction:column;gap:12px;}"
		+ ".aqw-chain-alternatives{display:flex;flex-direction:column;gap:10px;}"
		+ ".aqw-chain-alt-header{display:flex;align-items:center;gap:8px;color:#eadcc8;font-size:0.82rem;font-weight:700;}"
		+ ".aqw-chain-branch{display:flex;flex-direction:column;gap:10px;}"
		+ ".aqw-chain-leaf{color:#eadcc8;font-size:0.84rem;}"
		+ "@media (max-width: 760px){.aqw-chain-overlay{padding:12px;}.aqw-chain-header,.aqw-chain-body{padding:14px;}.aqw-chain-children{margin-left:10px;padding-left:12px;}}";
	document.head.appendChild(style);

	var overlay = document.createElement("div");
	overlay.id = "aqw-chain-overlay";
	overlay.className = "aqw-chain-overlay";
	overlay.innerHTML = ""
		+ "<div class='aqw-chain-dialog'>"
		+ "<div class='aqw-chain-header'>"
		+ "<div><div id='aqw-chain-title' class='aqw-chain-title'>Quest Chain</div><div id='aqw-chain-subtitle' class='aqw-chain-subtitle'></div></div>"
		+ "<button type='button' id='aqw-chain-close' class='aqw-chain-close'>&times;</button>"
		+ "</div>"
		+ "<div id='aqw-chain-body' class='aqw-chain-body'></div>"
		+ "</div>";
	document.body.appendChild(overlay);
	document.getElementById("aqw-chain-close").addEventListener("click", closeQuestChainOverlay);
	overlay.addEventListener("click", function(event) {
		if (event.target === overlay) {
			closeQuestChainOverlay();
		}
	});
}

function closeQuestChainOverlay() {
	var overlay = document.getElementById("aqw-chain-overlay");
	if (overlay) {
		overlay.classList.remove("active");
	}
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
	return filtered.length ? filtered : liveMatches;
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
			if (match.page.npc && match.page.npc.name) {
				meta.push("NPC: " + match.page.npc.name);
			}
			if (match.page.location && match.page.location.name) {
				meta.push("Location: " + match.page.location.name);
			}
			if (match.quest.requirements_note) {
				meta.push("Requires: " + match.quest.requirements_note);
			}
			return {
				kind: "source",
				sourceType: "Quest",
				name: match.quest.name || price[1] || "Quest Reward",
				slug: (match.page.slug || price[2] || "").replace(/#.*$/, ""),
				meta: meta,
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
		sources: await buildItemSourceBranches(item_name, d, {
			path: nextPath,
			counter: state.counter,
			depth: state.depth
		})
	};
}

function renderQuestChainNode(node, isRoot) {
	var mainLabel = node.slug ? "<a href='" + escapeHtml(wikiUrl(node.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(node.name) + "</a>" : "<span>" + escapeHtml(node.name) + "</span>";
	var qtyHtml = node.qty && String(node.qty) !== "1" ? "<span class='aqw-chain-pill'>x" + escapeHtml(String(node.qty)) + "</span>" : "";
	var special = "";
	if (node.cycle) {
		special = "<div class='aqw-chain-leaf'>Cycle detected here.</div>";
	}
	if (node.truncated) {
		special = "<div class='aqw-chain-leaf'>Further dependencies truncated.</div>";
	}
	if (node.missing) {
		special = "<div class='aqw-chain-leaf'>Source data unavailable.</div>";
	}

	var body = "";
	if (!special && node.sources && node.sources.length) {
		if (node.sources.length === 1) {
			body = "<div class='aqw-chain-children'>" + renderQuestChainSource(node.sources[0]) + "</div>";
		} else {
			body = "<div class='aqw-chain-children'><div class='aqw-chain-alternatives'><div class='aqw-chain-alt-header'><span class='aqw-chain-pill or'>OR</span><span>Any of these sources works</span></div>" + node.sources.map(renderQuestChainSource).join("") + "</div></div>";
		}
	}
	return ""
		+ "<div class='aqw-chain-node'>"
		+ "<div class='aqw-chain-card" + (isRoot ? " root" : "") + "'>"
		+ "<div class='aqw-chain-kicker'>" + (isRoot ? "Target Item" : "Required Item") + "</div>"
		+ "<div class='aqw-chain-main'>" + mainLabel + qtyHtml + "</div>"
		+ "</div>"
		+ special
		+ body
		+ "</div>";
}

function renderQuestChainSource(source) {
	var titleHtml = source.slug ? "<a href='" + escapeHtml(wikiUrl(source.slug)) + "' target='_blank' rel='noreferrer'>" + escapeHtml(source.name) + "</a>" : "<span>" + escapeHtml(source.name) + "</span>";
	var metaHtml = (source.meta || []).length ? "<div class='aqw-chain-meta'>" + source.meta.map(escapeHtml).join(" · ") + "</div>" : "";
	var childrenHtml = source.children && source.children.length ? "<div class='aqw-chain-children'>" + source.children.map(function(child) {
		return renderQuestChainNode(child, false);
	}).join("") + "</div>" : "<div class='aqw-chain-leaf'>No further item dependencies.</div>";
	return ""
		+ "<div class='aqw-chain-branch'>"
		+ "<div class='aqw-chain-card source'>"
		+ "<div class='aqw-chain-kicker'>" + escapeHtml(source.sourceType) + "</div>"
		+ "<div class='aqw-chain-main'>" + titleHtml + "</div>"
		+ metaHtml
		+ "</div>"
		+ childrenHtml
		+ "</div>";
}

async function openQuestChainOverlay(item_name, d) {
	ensureQuestChainUi();
	var overlay = document.getElementById("aqw-chain-overlay");
	var body = document.getElementById("aqw-chain-body");
	document.getElementById("aqw-chain-title").textContent = "Quest Chain";
	document.getElementById("aqw-chain-subtitle").textContent = item_name;
	body.innerHTML = "<div class='aqw-chain-loading'>Building dependency graph...</div>";
	overlay.classList.add("active");

	await ensureQuestChainDataReady();
	try {
		var tree = await buildQuestChainTree(item_name, d, 1);
		body.innerHTML = "<div class='aqw-chain-tree'>" + renderQuestChainNode(tree, true) + "</div>";
	} catch (err) {
		body.innerHTML = "<div class='aqw-chain-empty'>Failed to build dependency graph.</div>";
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
		openQuestChainOverlay(item_name, d);
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
