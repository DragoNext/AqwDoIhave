var DEFAULT_SETTINGS = {
	darkmode: 0,
	hoverPreviewEnabled: 1,
	imageProxyMode: "codetabs",
	customImageProxyUrl: ""
};

var currentSettings = null;
var popOverlay = null;
var popTriggerButton = null;
var lastFocusedElement = null;
var popCopyNode = null;
var popTopicButtons = [];
var popTopicContent = {
	default: "Hmm, what do you need, mortal?<br>I'm not tech support, figure it out yourself...<br>Or are you SOOOO pathetic that you can't?<br>I mean, not everyone has as many tentacles as me.<br>He~ he~",
	sacrifice: "Sacrifice?<br>Well I don't need anything from you mortal..<br>But I guess if you want to &quot;GIVE&quot; anything you could send some AP/HeroMart codes to my dad..<br>Where? Ah.. maybe here <a href=\"mailto:contactdrago@proton.me\">contactdrago@proton.me</a> he should see it.. eventually if he is not lazy today~",
	whoami: "Who am I?<br>Can't read? well.. the princess title is just extra~<br>I like flare.. but yes daughter of Drago (Not the Drago from Darkon saga Ewww!)<br>More precisely Drago creation his OC (Original Character)",
	drago: "Drago?<br>Not that DRAGO.. you think of... not that knockoff from Darkon Saga!<br>The real Drago, can't believe they just took his name willy nilly!<br>Hmm.. I wonder if I can sue them for it, he had this name before this man existed... tentacle court agrees with me.."
};

function setStatus(message, isError) {
	var status = document.getElementById("status");
	if (!status) {
		return;
	}
	status.textContent = message || "";
	status.style.color = isError ? "#ffd2cb" : "";
}

function download(content, fileName, contentType) {
	var a = document.createElement("a");
	var file = new Blob([content], { type: contentType });
	a.href = URL.createObjectURL(file);
	a.download = fileName;
	a.click();
}

function export_account() {
	var ExportData = {};
	chrome.storage.local.get({ aqwitems: [null] }, function(result) {
		var Items = result.aqwitems;
		chrome.storage.local.get({ aqwbuy: [null] }, function(result) {
			var Buy = result.aqwbuy;
			chrome.storage.local.get({ aqwcategory: [null] }, function(result) {
				var Category = result.aqwcategory;
				chrome.storage.local.get({ aqwwhere: [null] }, function(result) {
					var Where = result.aqwwhere;
					chrome.storage.local.get({ aqwtype: [null] }, function(result) {
						var Type = result.aqwtype;

						for (var i = 0; i < Items.length; i++) {
							ExportData[Items[i]] = [Buy[i], Category[i], Where[i], Type[i]];
						}

						download(JSON.stringify(ExportData), "AccountData.json", "text/plain");
						setStatus("AccountData.json exported.", false);
					});
				});
			});
		});
	});
}

function normalizeCustomProxyUrl(value) {
	return String(value || "").trim();
}

function getOriginPattern(url) {
	try {
		var parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return "";
		}
		return parsed.origin + "/*";
	} catch (err) {
		return "";
	}
}

function updateProxyFieldState() {
	var mode = document.getElementById("image_proxy_mode").value;
	var input = document.getElementById("custom_proxy_url");
	input.disabled = mode !== "custom";
}

function applySettingsToUi(settings) {
	document.getElementById("dark_mode").checked = !!settings.darkmode;
	document.getElementById("hover_preview_enabled").checked = settings.hoverPreviewEnabled !== 0;
	document.getElementById("image_proxy_mode").value = settings.imageProxyMode || "codetabs";
	document.getElementById("custom_proxy_url").value = settings.customImageProxyUrl || "";
	updateProxyFieldState();
}

function requestOriginPermission(originPattern, callback) {
	if (!originPattern) {
		callback(false);
		return;
	}
	chrome.permissions.contains({ origins: [originPattern] }, function(hasPermission) {
		if (hasPermission) {
			callback(true);
			return;
		}
		chrome.permissions.request({ origins: [originPattern] }, function(granted) {
			callback(!!granted);
		});
	});
}

function persistSettings(nextSettings, message) {
	chrome.storage.local.set(nextSettings, function() {
		currentSettings = {
			darkmode: nextSettings.darkmode ? 1 : 0,
			hoverPreviewEnabled: nextSettings.hoverPreviewEnabled ? 1 : 0,
			imageProxyMode: nextSettings.imageProxyMode || "codetabs",
			customImageProxyUrl: nextSettings.customImageProxyUrl || ""
		};
		applySettingsToUi(currentSettings);
		setStatus(message || "Settings saved.", false);
	});
}

function gatherUiSettings() {
	return {
		darkmode: document.getElementById("dark_mode").checked ? 1 : 0,
		hoverPreviewEnabled: document.getElementById("hover_preview_enabled").checked ? 1 : 0,
		imageProxyMode: document.getElementById("image_proxy_mode").value || "codetabs",
		customImageProxyUrl: normalizeCustomProxyUrl(document.getElementById("custom_proxy_url").value)
	};
}

function revertToCurrentSettings() {
	if (!currentSettings) {
		return;
	}
	applySettingsToUi(currentSettings);
}

function isPopOpen() {
	return !!(popOverlay && !popOverlay.hidden);
}

function setPopupTopic(topicName) {
	if (!popCopyNode) {
		return;
	}
	var nextTopic = popTopicContent[topicName] ? topicName : "default";
	popCopyNode.innerHTML = popTopicContent[nextTopic];
	popTopicButtons.forEach(function(button) {
		button.classList.toggle("is-active", button.dataset.popTopic === nextTopic);
	});
}

function openPop() {
	if (!popOverlay) {
		return;
	}
	lastFocusedElement = document.activeElement;
	setPopupTopic("default");
	popOverlay.hidden = false;
	document.body.style.overflow = "hidden";
}

function closePop() {
	if (!popOverlay) {
		return;
	}
	popOverlay.hidden = true;
	document.body.style.overflow = "";
	if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
		lastFocusedElement.focus();
	} else if (popTriggerButton) {
		popTriggerButton.focus();
	}
}

function bindPopupActions() {
	popOverlay = document.getElementById("aqw-pop-overlay");
	popTriggerButton = document.querySelector(".art-badge");
	popCopyNode = document.getElementById("aqw-pop-copy");
	popTopicButtons = Array.prototype.slice.call(document.querySelectorAll("[data-pop-topic]"));

	if (!popOverlay || !popTriggerButton) {
		return;
	}

	popTriggerButton.addEventListener("click", openPop);

	popOverlay.addEventListener("click", function(event) {
		if (event.target === popOverlay) {
			closePop();
			return;
		}

		var topicButton = event.target.closest("[data-pop-topic]");
		if (topicButton) {
			setPopupTopic(topicButton.dataset.popTopic);
		}
	});

	document.addEventListener("keydown", function(event) {
		if (event.key === "Escape" && isPopOpen()) {
			closePop();
		}
	});
}

function save_options() {
	var nextSettings = gatherUiSettings();

	if (nextSettings.imageProxyMode === "custom") {
		if (!nextSettings.customImageProxyUrl) {
			setStatus("Enter a custom proxy URL before switching to Custom Proxy.", true);
			return;
		}
		var customOrigin = getOriginPattern(nextSettings.customImageProxyUrl);
		if (!customOrigin) {
			setStatus("Custom proxy URL must start with http:// or https://", true);
			return;
		}
		requestOriginPermission(customOrigin, function(granted) {
			if (!granted) {
				setStatus("Permission for the custom proxy origin was denied.", true);
				revertToCurrentSettings();
				return;
			}
			persistSettings(nextSettings, "Settings saved.");
		});
		return;
	}

	if (nextSettings.imageProxyMode === "direct") {
		requestOriginPermission("http://aqwwiki.wikidot.com/*", function(granted) {
			if (!granted) {
				setStatus("AQW Wiki permission is required for Direct Wiki Fetch.", true);
				revertToCurrentSettings();
				return;
			}
			persistSettings(nextSettings, "Settings saved.");
		});
		return;
	}

	persistSettings(nextSettings, "Settings saved.");
}

function restore_options() {
	chrome.storage.local.get(DEFAULT_SETTINGS, function(result) {
		currentSettings = {
			darkmode: result.darkmode ? 1 : 0,
			hoverPreviewEnabled: result.hoverPreviewEnabled !== 0 ? 1 : 0,
			imageProxyMode: result.imageProxyMode || "codetabs",
			customImageProxyUrl: result.customImageProxyUrl || ""
		};
		applySettingsToUi(currentSettings);
	});
}

document.addEventListener("DOMContentLoaded", function() {
	restore_options();
	bindPopupActions();

	document.getElementById("export").addEventListener("click", export_account);
	document.getElementById("dark_mode").addEventListener("change", save_options);
	document.getElementById("hover_preview_enabled").addEventListener("change", save_options);
	document.getElementById("image_proxy_mode").addEventListener("change", function() {
		updateProxyFieldState();
		save_options();
	});
	document.getElementById("custom_proxy_url").addEventListener("change", save_options);
});
