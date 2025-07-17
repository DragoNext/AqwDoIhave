// js/Hover.js - Safe, isolated version for your extension

jQuery.noConflict();
(function( $ ) {
    // All of the original Hover.js code goes inside this wrapper.
    var mousePos = { x: -1, y: -1 };
    $(document).mousemove(function(event) {
        mousePos.x = event.clientX;
        mousePos.y = event.clientY;
    });

    var mouseHover = false;
    var controller = null;
    var timeout = null;

    $("body").on("mouseover", "#page-content a, .card.m-2.m-lg-3 a, #inventoryRendered a, #site-changes-list a", function() {
        hovered(this.href);
    }).on("mouseout", "#page-content a, .card.m-2.m-lg-3 a, #inventoryRendered a, #site-changes-list a", function() {
        unhovered();
    });

    $("body").on("mouseover", "#listinvFull tbody td:first-child, #wheel tbody td:first-child, table.table.table-sm.table-bordered tbody td:first-child", function() {
        hovered("http://aqwwiki.wikidot.com/" + this.textContent.split(/\sx\d+/)[0]);
    }).on("mouseout", "#listinvFull tbody td:first-child, #wheel tbody td:first-child, table.table.table-sm.table-bordered tbody td:first-child", function() {
        unhovered();
    });
    
    $("body").on("mouseover", "#listinvBuyBk2 tbody td:nth-child(2)", function() {
        hovered("http://aqwwiki.wikidot.com/" + this.textContent);
    }).on("mouseout", "#listinvBuyBk2 tbody td:nth-child(2)", function() {
        unhovered();
    });

    function hovered(link) {
        if (!mouseHover) {
            mouseHover = true;
            controller = new AbortController();
            timeout = setTimeout(function() {
                showPreview(link, controller.signal);
            }, 100);
        }
    }

    function unhovered() {
        clearTimeout(timeout);
        mouseHover = false;
        if (controller) {
            controller.abort();
        }
        removePreview();
    }

    async function fetchParse(url, signal) {
        const response = await fetch(url, { signal });
        const html = await response.text();
        return new DOMParser().parseFromString(html, "text/html");
    }

    async function wikimg(url, signal) {
        if (!url || !url.startsWith("http://aqwwiki.wikidot.com/")) return;
        if (window.location.hostname !== "aqwwiki.wikidot.com") {
            url = "https://api.codetabs.com/v1/proxy?quest=" + url;
        }
        try {
            var doc = await fetchParse(url, signal);
        } catch {
            return;
        }
        const type = $(doc).find("#breadcrumbs > a:last").text();
        switch (type) {
            case "AQWorlds Wiki":
                if ($(doc).find("#page-content span:first").text().includes("usually refers to")) {
                    for (let link of $(doc).find("#page-content a")) {
                        var images = await wikimg("http://aqwwiki.wikidot.com" + $(link).attr("href"));
                        if (images) return images;
                    }
                }
                return;
            case "Events": case "Factions": case "Game Menu": case "Quests":
            case "Shops": case "Hair Shops": case "Merge Shops": case "Enhancements":
                return;
            case "Book of Lore Badges": case "Character Page Badges":
                var image = $(doc).find("#page-content img:last");
                if (image.length) return [image.prop("src")];
                return;
            case "Classes": case "Armors":
                var image0 = $(doc).find("#wiki-tab-0-0:last img:first");
                var image1 = $(doc).find("#wiki-tab-0-1:last img:first");
                if (image0.length && image1.length) return [image0.prop("src"), image1.prop("src")];
            default:
                var image = $(doc).find("#page-content > img:last");
                if (image.length && !image.prop("src").includes("image-tags")) return [image.prop("src")];
                for (image of $(doc).find("#wiki-tab-0-0 img").toArray()) {
                    if (!$(image).prop("src").includes("image-tags")) return [$(image).prop("src")];
                }
                for (image of $(doc).find("#page-content > .collapsible-block img").toArray()) {
                    if (!$(image).prop("src").includes("image-tags")) return [$(image).prop("src")];
                }
        }
    }

    async function showPreview(url, signal) {
        $("body").append('<div id="preview" style="position:fixed; display:flex; z-index:9999; border: 1px solid #ccc; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>');
        const maxwidth = $(window).width() * 0.45;
        const maxheight = $(window).height() * 0.65;
        const images = await wikimg(url, signal);
        if (!images) {
            removePreview();
            return;
        }
        images.forEach(src => {
            $("#preview").append(`<img style="max-width:${maxwidth}px; max-height:${maxheight}px; height:auto; width:auto;" src="${src}">`);
        });
        waitForImg("#preview img", function() {
            $("#preview img").each(function() {
                this.style.height = this.offsetHeight * Math.min(1, maxwidth / $("#preview").width()) + "px";
            });
            $("#preview").css("top", mousePos.y - (mousePos.y / $(window).height()) * $("#preview").height() + "px");
            if (mousePos.x < $(window).width() / 2) {
                $("#preview").css("left", mousePos.x + 20 + "px");
            } else {
                $("#preview").css("right", $(window).width() - mousePos.x + 20 + "px");
            }
        });
    }

    function removePreview() {
        $("#preview").remove();
    }

    function waitForImg(selector, callback) {
        const wait = setInterval(function(){
            try {
                if( $(selector).toArray().every(e => $(e)[0].complete) ) {
                    callback();
                    clearInterval(wait);
                }
            } catch {
                clearInterval(wait);
            }
        }, 25);
    }
})(jQuery);