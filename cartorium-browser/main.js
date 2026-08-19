// --- 1. HANDLEBARS HELPER (REQUIRED FOR STOREFRONT) ---
Handlebars.registerHelper('jsonStringify', function(context) {
    return JSON.stringify(context);
});

class CartoriumWindow extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cartorium-ui",
      title: "Cartorium Map Hub",
      template: "modules/cartorium-browser/browser.html",
      width: 1280,
      height: 820,
      resizable: false
    });
  }

  async getData() {
    try {
      const cacheBuster = Date.now();

      const response = await fetch(
        `https://raw.githubusercontent.com/cartorium/Cartorium-assets/main/map-directory.json?t=${cacheBuster}`
      );

      if (!response.ok) {
        throw new Error(`Directory fetch failed`);
      }

      const data = await response.json();

      // --- INJECT GHOST WIP MAP FOR PERFECT HANDLEBARS LAYOUT ---
      if (data.showcase && data.showcase.wip) {
          data.maps.push({
              id: "cartorium-wip-card",
              name: "Work In Progress",
              thumb: data.showcase.wip.thumb || "",
              description: data.showcase.wip.summary || ""
          });
      }

      // Store maps separately
      this.appData = data.maps;

      // Store showcase config separately
      this.showcaseData = data.showcase;

      // Send BOTH to Handlebars
      return {
        maps: data.maps,
        showcase: data.showcase
      };

    } catch (error) {
      console.error("Cartorium | Menu Error:", error);

      ui.notifications.error(
        "Cartorium: Unable to connect to the live map directory."
      );

      return {
        maps: [],
        showcase: {}
      };
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    const workerBaseUrl = "https://cartorium-gatekeeper.boatofdoom.workers.dev";
    let rootEl = html.filter('.cartorium-browser-root');
    if (rootEl.length === 0) rootEl = html.find('.cartorium-browser-root');
    
    const app = this; 

    // ========================================================
    // --- PATREON DASHBOARD (Integrated) ---
    // ========================================================
    html.on('click', '.patreon-btn', (ev) => {
        ev.preventDefault();
        const token = localStorage.getItem("cartorium-vault-token");
        const savedTime = localStorage.getItem("cartorium-token-timestamp");
        const isExpired = savedTime && (Date.now() - savedTime > (25 * 24 * 60 * 60 * 1000));
        const isLinked = token && !isExpired;
        const tier = localStorage.getItem("cartorium-user-tier") || "Active Patron";

        new Dialog({
            title: "Cartorium Account Dashboard",
            content: `
                <div class="cartorium-dialog-body">
                    <div class="cartorium-dialog-status">
                        <span class="status-dot" style="background:${isLinked ? '#00e08a' : '#e2593a'}; box-shadow:0 0 6px ${isLinked ? '#00e08a' : '#e2593a'};"></span>
                        <span>${isLinked ? "Linked" : "Not Linked"}</span>
                    </div>
                    <div class="cartorium-dialog-tier">Current Tier: <strong>${isLinked ? tier : "None"}</strong></div>
                    <div class="cartorium-dialog-divider"></div>
                    <button id="open-patreon" class="patreon-btn" style="width:100%;">1. Open Patreon to Link</button>
                    <input type="text" id="p-code" class="cartorium-dialog-input" placeholder="Paste Auth Code Here">
                </div>
            `,
            buttons: {
                unlock: { label: "2. Unlock/Verify", callback: async (h) => {
                    const code = h.find("#p-code").val().trim();
                    if (!code) return ui.notifications.warn("Please enter a code");
                    try {
                        const tokenResp = await fetch(`${workerBaseUrl}/?code=${code}`);
                        const data = await tokenResp.json();
                        if (data.access_token) {
                            localStorage.setItem("cartorium-vault-token", data.access_token);
                            localStorage.setItem("cartorium-token-timestamp", Date.now());
                            localStorage.setItem("cartorium-user-tier", data.tier || "Active Patron");
                            ui.notifications.info(`Vault Unlocked! Tier: ${data.tier || "Active"}`);
                        } else {
                            throw new Error("Invalid Code");
                        }
                    } catch (err) { ui.notifications.error(err.message); }
                }},
                close: { label: "Close" }
            },
            render: (html) => {
                html.find('#open-patreon').click(() => {
                    window.open("https://www.patreon.com/oauth2/authorize?response_type=code&client_id=o3bS4jRO4uy8Oj0ni-_5CikmhZD8Cz9TCGCcisQn2rzpTYPvicJ8h8qCKKPHuHOQ&redirect_uri=https%3A%2F%2Fcartorium-gatekeeper.boatofdoom.workers.dev%2Fauth", "_blank");
                });
            }
        }, {
            id: "cartorium-account-dialog"
        }).render(true);
    });

    // ==========================================
    // --- TAB SWITCHING LOGIC (DYNAMIC 3-WINDOW) ---
    // ==========================================
    html.on('click', '.tab-btn', (ev) => {

        ev.preventDefault();

        const btn = ev.currentTarget;
        const target = btn.dataset.tab;

        html.find('.tab-btn').removeClass('active');
        $(btn).addClass('active');

        const cards = html.find('.map-card');
        const grid = html.find('.map-grid');

        // Reset all cards
        cards.removeClass(
            'reveal featured-hero featured-wip featured-popular'
        );

        cards.stop(true, true);

        cards.css({
            opacity: 0,
            transform: 'translateY(20px) scale(0.96)'
        });
        
        cards.hide();

        // Force repaint
        void grid[0].offsetWidth;

        // ==========================================
        // NORMAL VAULT TAB
        // ==========================================
        if (target === "all") {
            grid.removeClass('showcase-mode');
            
            // Hides the injected WIP card explicitly so it doesn't pollute the Vault
            cards.each(function() {
                if ($(this).data('id') !== "cartorium-wip-card") {
                    $(this).show();
                }
            });

            setTimeout(() => {
                cards.css({
                    opacity: 1,
                    transform: ''
                });
            }, 40);
        }

        // ==========================================
        // FEATURED TAB
        // ==========================================
        else if (target === "featured") {
            grid.addClass('showcase-mode');

            const latestId = app.showcaseData.latest.id;
            const popularId = app.showcaseData.popular.id;
            const wipId = "cartorium-wip-card"; // Target the injected ghost card

            cards.each(function () {
                const card = $(this);
                const mapId = card.data('id');

                if (mapId === latestId || mapId === wipId || mapId === popularId) {
                    card.show().addClass('reveal');

                    setTimeout(() => {
                        card.css({ opacity: 1, transform: '' });
                    }, 80);

                    // HERO
                    if (mapId === latestId) {
                        card.addClass('featured-hero');
                    }

                    // WIP
                    else if (mapId === wipId) {
                        card.addClass('featured-wip');
                        
                        // NEW: Make the card completely ignore mouse clicks and hovers
                        card.css('pointer-events', 'none');
                        
                        const wipData = app.showcaseData.wip;
                        const progress = wipData.progress || 0;

                        // 1. Update Progress Bar
                        card.find('.wip-fill').css('width', progress + '%');
                        card.find('.wip-status').html(`Status: Construction ${progress}% <i class="fas fa-hammer"></i>`);

                        // 2. Inject Summary
                        if (wipData.summary) {
                            card.find('.wip-summary').text(wipData.summary).show();
                        }

                        // 3. Inject Features Array
                        if (wipData.features && wipData.features.length > 0) {
                            let featureHtml = "";
                            wipData.features.forEach(feat => {
                                featureHtml += `<div class="wip-feature-item"><i class="fas ${feat.icon}"></i> ${feat.label}</div>`;
                            });
                            card.find('.wip-features-container').html(featureHtml).show();
                        }
                    }

                    // POPULAR
                    else if (mapId === popularId) {
                        card.addClass('featured-popular');
                    }
                }
            });
        }
    });

    // ==========================================
    // --- INITIALIZE DEFAULT TAB ON LOAD ---
    // ==========================================
    // Triggering synchronously (no timeout) prevents the 50ms flash!
    html.find('.tab-btn[data-tab="featured"]').trigger('click');

    // ==========================================
    // --- OPEN DETAIL VIEW (App Store View) ---
    // ==========================================
    let currentMapData = null;
    const EXPIRY_IN_DAYS = 25;
    const EXPIRY_MS = EXPIRY_IN_DAYS * 24 * 60 * 60 * 1000;

    html.on('click', '.open-detail-btn', (ev) => {
        const card = ev.currentTarget;
        const mapId = card.dataset.id;

        // Failsafe: Prevent the WIP card from opening if clicked anyway
        if (mapId === "cartorium-wip-card") return;

        currentMapData = app.appData.find(m => m.id === mapId);
        if (!currentMapData) return ui.notifications.error("Could not load map details.");

        // --- FREE MAP FLAG CHECK ---
        const isFreeMap = currentMapData.isFree === true;

        html.find('#detail-title').text(currentMapData.name);
        resetPanState();
        html.find('#detail-main-img').attr('src', currentMapData.thumb);
        html.find('#detail-main-img-fade').attr('src', currentMapData.thumb);
        html.find('#detail-description').text(currentMapData.description || "A highly detailed battlemap ready for your campaign.");

        let accessToken = localStorage.getItem("cartorium-vault-token");
        const savedTime = localStorage.getItem("cartorium-token-timestamp");
        const isExpired = savedTime && (Date.now() - savedTime > EXPIRY_MS);
        
        // Grab the tier BEFORE we evaluate the blur overlay
        const userTier = localStorage.getItem("cartorium-user-tier"); 

        const authOverlay = html.find('#detail-auth-overlay');

        // The vault un-blurs if they have a token, OR if the map is completely free
        if ((accessToken && !isExpired && userTier && userTier !== "None" && userTier !== "Unknown") || isFreeMap) {
            authOverlay.addClass('hidden'); 
        } else {
            authOverlay.removeClass('hidden'); 
            
            // UX Bonus: Tell them exactly why they are locked out
            if (accessToken && !isExpired && (userTier === "None" || userTier === "Unknown")) {
                authOverlay.find('h3').text("Active Pledge Required");
                authOverlay.find('p').text("Your Patreon is linked, but no active Cartorium pledge was found.");
                authOverlay.find('.auth-prompt-btn').html('<i class="fas fa-sync"></i> CHECK AGAIN');
            } else {
                authOverlay.find('h3').text("Vault Locked");
                authOverlay.find('p').text("Link Patreon to unlock the Cartorium archives.");
                authOverlay.find('.auth-prompt-btn').html('<i class="fab fa-patreon"></i> LINK PATREON');
            }
        }

        const t2Container = html.find('#tier2-content').empty();

        // ==========================================
        // DYNAMIC VARIANT SWITCHER LOGIC
        // ==========================================
        const variantSelector = html.find('#variant-selector').empty();

        // Always show at least "Original Release"; real variants (if any) get added alongside it
        variantSelector.append(`<button class="var-btn active" data-index="-1">Original Release</button>`);

        if (currentMapData.variants && currentMapData.variants.length > 0 && currentMapData.variants[0].name !== "") {
            currentMapData.variants.forEach((v, index) => {
                variantSelector.append(`<button class="var-btn" data-index="${index}">${v.name}</button>`);
            });
        }

        // Helper function to build the Tier 2 Install Buttons
        app.renderInstallTab = (vIndex) => {
            t2Container.empty();

            const installLabel = "Install Prebuilt Map & Scene";

            if (vIndex === -1) {
                const baseJson = currentMapData.premiumJson || currentMapData.jsonFile;
                if (baseJson) {
                    t2Container.append(`<button class="action-btn install-btn gold-btn" data-type="walled"><i class="fas fa-dungeon"></i> ${installLabel}</button>`);
                }
            } else {
                const vData = currentMapData.variants[vIndex];
                if (vData.json) {
                    t2Container.append(`<button class="action-btn install-btn gold-btn" data-type="variant_${vIndex}_walled"><i class="fas fa-dungeon"></i> ${installLabel}</button>`);
                }
            }

            if (t2Container.children().length === 0) {
                t2Container.append(`<div class="empty-tier-msg">No files found for this version.</div>`);
            }
        };

        // Initialize with the Original Map (-1)
        app.renderInstallTab(-1);

        // ==========================================
        // MEMBERSHIP CARD (A1) - reflects the viewer's actual authenticated tier
        // ==========================================
        const membershipCard = html.find('#membership-card');
        const membershipImage = html.find('#membership-image');
        const membershipName = html.find('#membership-name');

        membershipCard.removeClass('switching');
        void membershipCard[0].offsetWidth;
        membershipCard.addClass('switching');
        membershipCard.removeClass('bronze-tier silver-tier gold-tier');

        if (userTier === "Blood Sworn" || userTier === "Creator") {
            membershipCard.addClass('gold-tier');
            membershipImage.attr('src', 'modules/cartorium-browser/assets/gold-tier.webp');
            membershipName.text('Blood Sworn');
        } else if (userTier === "Oath Forged") {
            membershipCard.addClass('silver-tier');
            membershipImage.attr('src', 'modules/cartorium-browser/assets/silver-tier.webp');
            membershipName.text('Oath Forged');
        } else {
            membershipCard.addClass('bronze-tier');
            membershipImage.attr('src', 'modules/cartorium-browser/assets/bronze-tier.webp');
            membershipName.text('Free Member');
        }

        // ==========================================
        // BLOOD SWORN TEASER (A2) - always visible, one of four states depending on
        // both the viewer's tier AND whether this specific map has Blood Sworn content.
        // Free maps grant everything to everyone, so they always read as fully unlocked.
        // ==========================================
        const hasBloodSwornContent = !!currentMapData.tokens || !!currentMapData.pdfUrl;
        const teaser = html.find('#blood-sworn-teaser');
        const teaserIcon = html.find('#teaser-icon');
        const teaserTitle = html.find('#teaser-title');
        const teaserSub = html.find('#teaser-sub');
        const teaserCta = html.find('#teaser-cta');

        teaser.removeClass('teaser-available teaser-unlocked teaser-locked');
        teaserTitle.removeClass('teaser-title-lg');
        teaserSub.show();
        const isFreeMember = !userTier || userTier === "None" || userTier === "Unknown";

        if (isFreeMap && isFreeMember) {
            teaser.addClass('teaser-unlocked');
            teaserIcon.attr('class', 'fas fa-gift');
            teaserTitle.text('This map is free to install');
            teaserSub.text('No subscription needed');
        } else if (isFreeMap) {
            // Still a free map - keep the "what's included" a surprise even for subscribers
            teaser.addClass('teaser-unlocked');
            teaserIcon.attr('class', 'fas fa-crown');
            teaserTitle.text('All premium content unlocked');
            teaserSub.text('You have full access to this map');
        } else if (userTier === "Blood Sworn" || userTier === "Creator") {
            teaser.addClass('teaser-unlocked');
            teaserIcon.attr('class', 'fas fa-crown');
            teaserTitle.text('All premium content unlocked');
            teaserSub.text('Walls, Lights, Doors, Tokens, Journal');
        } else if (userTier === "Oath Forged") {
            if (hasBloodSwornContent) {
                teaser.addClass('teaser-available');
                teaserIcon.attr('class', 'fas fa-scroll');
                teaserTitle.text('Blood Sworn content available');
                teaserSub.text('PDF, Tokens & more');
                teaserCta.text('Upgrade Now');
            } else {
                teaser.addClass('teaser-unlocked');
                teaserIcon.attr('class', 'fas fa-circle-check');
                teaserTitle.text('All content unlocked').addClass('teaser-title-lg');
                teaserSub.text('Walls, Lights, Doors');
            }
        } else {
            teaser.addClass('teaser-locked');
            teaserIcon.attr('class', 'fas fa-lock');
            teaserTitle.text('Subscribe for premium content');
            teaserSub.text('Unlock every map in the Vault');
            teaserCta.text('Subscribe Now');
        }

        setTimeout(() => rootEl.addClass('show-detail'), 50);
    });

    html.on('click', '.close-detail-btn', (ev) => {
        ev.preventDefault();
        rootEl.removeClass('show-detail');
        resetPanState();
    });
    // ==========================================
    // --- VARIANT IMAGE & BUTTON SWITCHER ---
    // ==========================================
    html.on('click', '.var-btn', (ev) => {
        ev.preventDefault();
        
        const btn = $(ev.currentTarget);
        html.find('.var-btn').removeClass('active');
        btn.addClass('active');
        
        const vIndex = parseInt(btn.data('index'));
        resetPanState();
        const mainImg = html.find('#detail-main-img');
        const fadeImg = html.find('#detail-main-img-fade');

        // Fade out image, swap source, fade in
        mainImg.css('opacity', '0.5');
        setTimeout(() => {
            let newSrc;
            if (vIndex === -1) {
                newSrc = currentMapData.thumb;
            } else {
                const vData = currentMapData.variants[vIndex];
                newSrc = vData.thumb || vData.image || currentMapData.thumb;
            }
            mainImg.attr('src', newSrc);
            fadeImg.attr('src', newSrc);
            mainImg.css('opacity', '1');
        }, 150);

        // Update the install buttons on the right side
        app.renderInstallTab(vIndex);
    });

    // ==========================================
    // --- MAP PREVIEW CLICK-TO-SCROLL PAN ---
    // Clicking starts a slow top-to-bottom pan revealing the full image.
    // Clicking again while it's running pauses it in place; clicking a paused
    // pan resumes it from exactly where it left off (animation-play-state
    // handles the freeze/resume natively, no manual position math needed).
    // Once the pan finishes it crossfades back to the starting position and
    // resets, ready to be triggered again on the next click.
    // ==========================================
    let panState = 'idle'; // 'idle' | 'playing' | 'paused'
    let isCrossfading = false; // true during the brief automatic snap-back after a pan completes
    let panResetTimer = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function updatePanIcon() {
        const icon = html.find('.pan-hint i');
        if (panState === 'playing') {
            icon.removeClass('fa-play').addClass('fa-pause');
        } else {
            icon.removeClass('fa-pause').addClass('fa-play');
        }
    }

    // Fully cancels any in-flight pan/crossfade and snaps the preview back to its
    // resting state. Must be called whenever the preview image is swapped out
    // (closing the detail view, or opening a different map) so a leftover
    // animation/timer from the previous image doesn't keep running against it.
    function resetPanState() {
        clearTimeout(panResetTimer);
        panResetTimer = null;
        panState = 'idle';
        isCrossfading = false;
        const img = html.find('#detail-main-img');
        const fadeImg = html.find('#detail-main-img-fade');
        img.removeClass('panning paused');
        fadeImg.removeClass('fade-visible');
        img.css('object-position', '50% 0%');
        fadeImg.css('object-position', '50% 0%');
        updatePanIcon();
        deactivateZoom();
    }

    html.on('click', '.detail-image-box', (ev) => {
        if ($(ev.target).closest('.zoom-toggle-btn').length) return; // that button handles its own click
        if (reduceMotion || isCrossfading) return;
        const img = html.find('#detail-main-img');
        const fadeImg = html.find('#detail-main-img-fade');
        if (!img.length) return;

        if (panState === 'idle') {
            panState = 'playing';
            img.removeClass('panning paused');
            fadeImg.removeClass('fade-visible');
            img.css('object-position', '50% 0%');
            void img[0].offsetWidth; // force reflow so the animation restarts cleanly
            img.addClass('panning');
        } else if (panState === 'playing') {
            panState = 'paused';
            img.addClass('paused'); // freezes the running animation exactly where it is
        } else if (panState === 'paused') {
            panState = 'playing';
            img.removeClass('paused'); // resumes the animation from where it froze
        }
        updatePanIcon();
    });

    html.on('animationend', '#detail-main-img', (ev) => {
        const img = $(ev.currentTarget);
        if (!img.hasClass('panning')) return;

        img.removeClass('panning paused');
        img.css('object-position', '50% 100%'); // lock in the fully-panned position
        isCrossfading = true;

        // The fade layer holds the same image reset to the top framing, still invisible.
        // Fading it in over the panned main image is the crossfade "reveal".
        const fadeImg = html.find('#detail-main-img-fade');
        fadeImg.css('object-position', '50% 0%');
        void fadeImg[0].offsetWidth; // force reflow so the transition starts cleanly
        fadeImg.addClass('fade-visible');

        panResetTimer = setTimeout(() => {
            // Fade layer is now fully opaque and covering the main image - safe to
            // silently snap the main image back to match, with no visible jump.
            img.css('object-position', '50% 0%');
            fadeImg.removeClass('fade-visible'); // fades back out, revealing the now-matching main image
            panState = 'idle'; // ready to trigger again
            isCrossfading = false;
            panResetTimer = null;
            updatePanIcon();
        }, 1400); // matches the .detail-image-fade-layer transition duration
    });

    // ==========================================
    // --- MAP PREVIEW ZOOM LOUPE ---
    // Clicking the magnifying glass button arms a real magnifying loupe that
    // follows the cursor over the preview. It only stays armed while the mouse
    // is over the image - moving off turns it off again, and it takes another
    // explicit click of the button to re-arm.
    // ==========================================
    let zoomActive = false;
    let zoomLeaveTimer = null;
    let zoomRafId = null;
    let lastMouseX = 0;
    let lastMouseY = 0;
    const ZOOM_LEAVE_GRACE_MS = 400; // small buffer so a quick, accidental mouse-off doesn't kill zoom instantly

    function deactivateZoom() {
        clearTimeout(zoomLeaveTimer);
        zoomLeaveTimer = null;
        cancelAnimationFrame(zoomRafId);
        zoomRafId = null;
        zoomActive = false;
        html.find('.zoom-toggle-btn').removeClass('zoom-active');
        html.find('.detail-image-box').removeClass('zoom-mode');
        html.find('.zoom-lens').css('opacity', '0'); // fades out via its CSS transition rather than snapping away
    }

    // Redraws the lens at the last known cursor position. Called on every mouse
    // move, but also driven by a rAF loop below - the pan animation keeps moving
    // the underlying image even while the cursor sits still, so the lens has to
    // keep re-syncing on its own or it goes stale between mouse movements.
    function updateZoomLens() {
        const img = html.find('#detail-main-img')[0];
        const lens = html.find('.zoom-lens');
        if (!img || !img.src) return;

        const rect = img.getBoundingClientRect();
        const naturalW = img.naturalWidth || rect.width;
        const naturalH = img.naturalHeight || rect.height;

        // Emulate the same object-fit: cover framing the <img> itself uses, so the
        // lens content lines up with what's visible. object-position isn't fixed
        // at 50%/0% though - the pan animation drives it live, so read the actual
        // current (possibly mid-animation) value instead of assuming the resting one.
        const computedPos = window.getComputedStyle(img).objectPosition.split(' ').map(parseFloat);
        const xPct = isNaN(computedPos[0]) ? 50 : computedPos[0];
        const yPct = isNaN(computedPos[1]) ? 0 : computedPos[1];

        const coverScale = Math.max(rect.width / naturalW, rect.height / naturalH);
        const displayedW = naturalW * coverScale;
        const displayedH = naturalH * coverScale;
        const offsetX = (rect.width - displayedW) * (xPct / 100);
        const offsetY = (rect.height - displayedH) * (yPct / 100);

        const x = Math.max(0, Math.min(lastMouseX - rect.left, rect.width));
        const y = Math.max(0, Math.min(lastMouseY - rect.top, rect.height));

        const zoomFactor = 1.25;
        const lensSize = 190;
        const bgW = displayedW * zoomFactor;
        const bgH = displayedH * zoomFactor;
        const bgX = lensSize / 2 - (x - offsetX) * zoomFactor;
        const bgY = lensSize / 2 - (y - offsetY) * zoomFactor;

        lens.css({
            opacity: '1',
            left: (x - lensSize / 2) + 'px',
            top: (y - lensSize / 2) + 'px',
            backgroundImage: `url("${img.src}")`,
            backgroundSize: `${bgW}px ${bgH}px`,
            backgroundPosition: `${bgX}px ${bgY}px`
        });
    }

    function zoomLoop() {
        if (!zoomActive) {
            zoomRafId = null;
            return;
        }
        updateZoomLens();
        zoomRafId = requestAnimationFrame(zoomLoop);
    }

    html.on('click', '.zoom-toggle-btn', (ev) => {
        ev.preventDefault();
        ev.stopPropagation(); // don't also trigger the play/pause click on the box underneath
        if (reduceMotion) return;

        if (zoomActive) {
            deactivateZoom();
        } else {
            zoomActive = true;
            html.find('.zoom-toggle-btn').addClass('zoom-active');
            html.find('.detail-image-box').addClass('zoom-mode');
        }
    });

    html.on('mousemove', '.detail-image-box', (ev) => {
        if (!zoomActive) return;
        clearTimeout(zoomLeaveTimer); // still moving over the box, cancel any pending deactivation
        zoomLeaveTimer = null;
        lastMouseX = ev.clientX;
        lastMouseY = ev.clientY;
        if (zoomRafId === null) zoomRafId = requestAnimationFrame(zoomLoop); // kick off continuous tracking
        updateZoomLens();
    });

    html.on('mouseleave', '.detail-image-box', () => {
        if (!zoomActive) return;
        clearTimeout(zoomLeaveTimer);
        zoomLeaveTimer = setTimeout(deactivateZoom, ZOOM_LEAVE_GRACE_MS);
    });

    // ==========================================
    // --- FIX STALE SCENE-QUALIFIED UUIDs (MATT tile-to-tile references) ---
    // Monk's Active Tile Triggers cross-tile actions ("Trigger Tile", "Select
    // Wall", etc.) store their target as a full UUID like
    // "Scene.<oldSceneId>.Tile.<tileId>". Every install creates a brand new
    // scene with a brand new id, so any UUID baked in from whenever the
    // source JSON was built goes stale - MATT's UI only displays the tile-id
    // half, so the reference LOOKS unchanged even though it now points at a
    // scene that no longer exists in this world.
    // Fix: pre-assign the new scene's id ourselves (Foundry accepts an
    // explicit _id in creation data) and rewrite every "Scene.<oldId>."
    // prefix found anywhere in the source JSON to match it, before the scene
    // is even created - a no-op for any map that has none of these refs.
    // ==========================================
    function fixStaleSceneUuids(sceneData) {
        const raw = JSON.stringify(sceneData);
        const oldIds = new Set();
        const regex = /Scene\.([A-Za-z0-9]{16,})\./g;
        let match;
        while ((match = regex.exec(raw)) !== null) oldIds.add(match[1]);
        if (!oldIds.size) return sceneData;

        const newId = foundry.utils.randomID();
        let fixed = raw;
        for (const oldId of oldIds) {
            fixed = fixed.split(`Scene.${oldId}.`).join(`Scene.${newId}.`);
        }

        const result = JSON.parse(fixed);
        result._id = newId; // so the scene is actually created with the id we just rewrote everything to point at
        return result;
    }

    // ==========================================
    // --- MODULE-LOCAL ASSET REHOSTING ---
    // Some maps (e.g. Thieves Guild) reference their token/item art from a
    // separate local module (e.g. "modules/cartorium-thieves-guild/Assets/...")
    // rather than through the Vault pipeline. Subscribers installing the map on
    // their own Foundry instance won't have that module, so any such path needs
    // fetching through the worker (from the map's Vault folder) and re-uploading
    // into the subscriber's own world before the scene/actors are created.
    // Walks the whole JSON tree rather than targeting specific fields (img,
    // texture.src, etc.) since token/actor/item schemas bury these paths in
    // different spots and a prefix match is more robust than chasing each one.
    // ==========================================
    async function rehostModuleAssets(node, mapId, safeToken, modulePrefix, cache) {
        if (!modulePrefix) return node;

        if (typeof node === 'string') {
            if (!node.startsWith(modulePrefix)) return node;
            if (cache[node]) return cache[node];

            // Module-stored paths (e.g. from MATT's file picker) are often already
            // percent-encoded (spaces as %20, etc.) - decode first so we don't
            // double-encode it into the query param below.
            const relativePath = decodeURIComponent(node.slice(modulePrefix.length));
            try {
                const assetUrl = `${workerBaseUrl}/?token=${safeToken}&mapId=${mapId}&file=${encodeURIComponent(relativePath)}`;
                const resp = await fetch(assetUrl);
                if (!resp.ok) throw new Error(`status ${resp.status}`);
                const blob = await resp.blob();

                const folderPath = "cartorium-vault-maps";
                await FilePicker.createDirectory("data", folderPath).catch(() => {});
                const safeName = `${mapId}_${relativePath.replace(/[\/\\]/g, "_")}`;
                const file = new File([blob], safeName, { type: blob.type });
                const uploadResult = await FilePicker.upload("data", folderPath, file);
                const newPath = uploadResult.path || uploadResult.file || uploadResult;

                cache[node] = newPath;
                return newPath;
            } catch (err) {
                console.warn(`Cartorium | Failed to rehost module asset "${node}":`, err);
                return node; // fall back to the original (broken) path rather than fail the whole install
            }
        }

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                node[i] = await rehostModuleAssets(node[i], mapId, safeToken, modulePrefix, cache);
            }
            return node;
        }

        if (node && typeof node === 'object') {
            for (const key of Object.keys(node)) {
                node[key] = await rehostModuleAssets(node[key], mapId, safeToken, modulePrefix, cache);
            }
            return node;
        }

        return node;
    }

    // ==========================================
    // --- THE INSTALL PROCESS ---
    // ==========================================
    html.on('click', '.install-btn', async (ev) => {
      ev.preventDefault();

      // --- GRACEFUL FAIL FOR PLAYERS ---
      if (!game.user.isGM) return ui.notifications.warn("Cartorium: Only Game Masters can install maps to the server.");

      if (!currentMapData) return;

      const btn = $(ev.currentTarget);
      if (btn.prop('disabled')) return; // already installing - ignore repeat clicks
      const originalBtnHtml = btn.html();
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Installing...');

      try {

      const type = ev.currentTarget.dataset.type;
      const mapName = currentMapData.name;
      const mapId = currentMapData.id;
      const isFreeMap = currentMapData.isFree === true;
      
      let jsonFile = null, targetFile = null, finalSceneName = mapName;

      if (type === "walled") {
          jsonFile = currentMapData.premiumJson || currentMapData.jsonFile;
          targetFile = currentMapData.premiumImage || currentMapData.imageFile;
      } else if (type === "unwalled") {
          targetFile = currentMapData.premiumImage || currentMapData.imageFile;
      } else if (type.startsWith("variant_")) {
          const parts = type.split("_");
          const vIndex = parseInt(parts[1]);
          const vFileType = parts[2]; 
          const variant = currentMapData.variants[vIndex];
          
          if (variant.name) finalSceneName = variant.name;
          
          if (vFileType === "walled") {
              jsonFile = variant.json;
              targetFile = variant.image;
          } else {
              targetFile = variant.image;
          }
      }

      let accessToken = localStorage.getItem("cartorium-vault-token");
      const savedTime = localStorage.getItem("cartorium-token-timestamp");
      const isExpired = savedTime && (Date.now() - savedTime > EXPIRY_MS);

      // ONLY throw the token error if it's NOT a free map
      if (!isFreeMap && (!accessToken || isExpired)) {
        ui.notifications.error("Vault Session Invalid. Please click 'Link Patreon' to unlock.");
        return;
      }

      try {
        // If it's a free map and they have no token, pass 'public' to prevent URL errors
        const safeToken = accessToken || 'public';
        const rehostCache = {}; // shared across this install run so repeated module assets are only fetched/uploaded once
        const imageUrl = `${workerBaseUrl}/?token=${safeToken}&mapId=${mapId}&file=${encodeURIComponent(targetFile)}`;
        console.log("Cartorium DEBUG | targetFile:", targetFile, "| jsonFile:", jsonFile);
        console.log("Cartorium DEBUG | imageUrl:", imageUrl);
        const imageResponse = await fetch(imageUrl);
        console.log("Cartorium DEBUG | imageResponse.ok:", imageResponse.ok, "| status:", imageResponse.status, "| content-type:", imageResponse.headers.get("content-type"));
        if (!imageResponse.ok) throw new Error("Access Denied.");
        const imageBlob = await imageResponse.blob();
        console.log("Cartorium DEBUG | imageBlob type:", imageBlob.type, "| size:", imageBlob.size);
        
        const folderPath = "cartorium-vault-maps";
        try { await FilePicker.createDirectory("data", folderPath); } catch (e) { console.log("Cartorium DEBUG | createDirectory note:", e.message); }
        const file = new File([imageBlob], `${mapId}_${type}_${Date.now()}.png`, { type: imageBlob.type });
        const uploadResult = await FilePicker.upload("data", folderPath, file);
        console.log("Cartorium DEBUG | uploadResult:", uploadResult);

        let sceneData = {};
        if (!!jsonFile) {
            const sceneResponse = await fetch(`${workerBaseUrl}/?token=${safeToken}&mapId=${mapId}&file=${encodeURIComponent(jsonFile)}`);
            sceneData = await sceneResponse.json();
            
            if (!sceneData.background) sceneData.background = {};
            sceneData.background.src = uploadResult.path || uploadResult.file || uploadResult;
            sceneData.name = finalSceneName;

            if (currentMapData.localModulePrefix) {
                sceneData = await rehostModuleAssets(sceneData, mapId, safeToken, currentMapData.localModulePrefix, rehostCache);
            }

            sceneData = fixStaleSceneUuids(sceneData);
        } else {
            const imgObj = new Image();
            imgObj.src = URL.createObjectURL(imageBlob);
            await new Promise(r => imgObj.onload = r);
            
            sceneData = { name: finalSceneName, background: { src: uploadResult.path || uploadResult.file || uploadResult }, width: imgObj.width, height: imgObj.height }; 
        }
        console.log("Cartorium DEBUG | final sceneData:", JSON.stringify(sceneData));

        // keepId: true - without it Foundry silently generates its own random _id
        // and ignores any _id we supplied, which would break fixStaleSceneUuids()
        // above (it pre-picks an id and rewrites every UUID reference to match it).
        const importedScene = await Scene.create(sceneData, { keepId: true });
        if (importedScene) {
          // --- V14 COMPATIBILITY: background now lives on an embedded Level, not the Scene itself ---
          try {
            const levelsCollection = importedScene.levels; // undefined on pre-V14 worlds
            if (levelsCollection && levelsCollection.size > 0) {
              const defaultLevel = levelsCollection.contents[0];
              const bgSrc = uploadResult.path || uploadResult.file || uploadResult;
              console.log("Cartorium DEBUG | patching V14 default Level background to:", bgSrc);
              await defaultLevel.update({ background: { src: bgSrc } });
            }
          } catch (levelErr) {
            console.warn("Cartorium | Level background patch skipped/failed:", levelErr);
          }

          // --- PREMIUM EXTRAS: actors, pre-placed tokens, and journals for Blood Sworn/Creator ---
          const userTier = localStorage.getItem("cartorium-user-tier");
          const extrasEntitled = isFreeMap || userTier === "Blood Sworn" || userTier === "Creator";

          if (extrasEntitled && currentMapData.tokens) {
            try {
              const extrasResponse = await fetch(`${workerBaseUrl}/?token=${safeToken}&mapId=${mapId}&file=${encodeURIComponent(currentMapData.tokens)}`);
              if (extrasResponse.ok) {
                let extras = await extrasResponse.json();
                console.log("Cartorium DEBUG | extras payload:", extras);

                if (currentMapData.localModulePrefix) {
                    extras = await rehostModuleAssets(extras, mapId, safeToken, currentMapData.localModulePrefix, rehostCache);
                }

                const actorByKey = {};
                if (extras.actors?.length) {
                  // Capture keys BEFORE creation - Actor.createDocuments sanitizes its input
                  // objects against the Actor schema, which strips our custom "key" field.
                  const actorKeys = extras.actors.map(a => a.key);
                  let createdActors = [];
                  try {
                    createdActors = await Actor.createDocuments(extras.actors);
                  } catch (actorErr) {
                    console.error("Cartorium DEBUG | Actor.createDocuments threw:", actorErr);
                  }
                  console.log(`Cartorium DEBUG | Actor.createDocuments: requested ${extras.actors.length}, created ${createdActors.length}`, createdActors);
                  actorKeys.forEach((key, i) => { actorByKey[key] = createdActors[i]; });
                }

                const journalByKey = {};
                if (extras.journals?.length) {
                  const journalKeys = extras.journals.map(j => j.key);
                  let createdJournals = [];
                  try {
                    createdJournals = await JournalEntry.createDocuments(extras.journals);
                  } catch (journalErr) {
                    console.error("Cartorium DEBUG | JournalEntry.createDocuments threw:", journalErr);
                  }
                  console.log(`Cartorium DEBUG | JournalEntry.createDocuments: requested ${extras.journals.length}, created ${createdJournals.length}`, createdJournals);
                  journalKeys.forEach((key, i) => { journalByKey[key] = createdJournals[i]; });
                }

                if (extras.tokens?.length) {
                  const tokenDocs = [];
                  for (const t of extras.tokens) {
                    const actor = actorByKey[t.actorKey];
                    if (!actor) {
                      console.warn("Cartorium | Skipping token - no actor found for key:", t.actorKey);
                      continue;
                    }
                    try {
                      const tokenDoc = await actor.getTokenDocument({ x: t.x, y: t.y });
                      tokenDocs.push(tokenDoc.toObject());
                    } catch (tokenErr) {
                      console.warn(`Cartorium | Failed to build token for actor "${actor.name}":`, tokenErr);
                    }
                  }
                  if (tokenDocs.length) await importedScene.createEmbeddedDocuments("Token", tokenDocs);
                }

                if (extras.notes?.length) {
                  const noteDocs = extras.notes
                    .map(n => {
                      const journal = journalByKey[n.journalKey];
                      if (!journal) {
                        console.warn("Cartorium | Skipping note - no journal found for key:", n.journalKey);
                        return null;
                      }
                      return { entryId: journal.id, x: n.x, y: n.y };
                    })
                    .filter(Boolean);
                  if (noteDocs.length) await importedScene.createEmbeddedDocuments("Note", noteDocs);
                }

                ui.notifications.info("Blood Sworn extras added: monsters and journals deployed.");
              } else {
                console.warn("Cartorium | Premium extras fetch failed:", extrasResponse.status);
              }
            } catch (extrasErr) {
              console.warn("Cartorium | Premium extras skipped:", extrasErr);
            }
          } else if (currentMapData.tokens) {
            ui.notifications.info("Tip: This map includes Blood Sworn monsters & journals — a higher pledge tier will auto-include them next time.");
          }

          ui.notifications.info(`SUCCESS: ${finalSceneName} deployed. Generating thumbnail...`);

          // --- THUMBNAIL GENERATION & SIDEBAR REFRESH ---
          try {
              const thumbData = await importedScene.createThumbnail();
              
              if (thumbData && thumbData.thumb) {
                  await importedScene.update({ thumb: thumbData.thumb });
              }
              
              if (ui.scenes) ui.scenes.render(true);
              
          } catch (e) {
              console.warn("Cartorium | Thumbnail generation skipped or failed:", e);
          }

          importedScene.view();
        }
      } catch (err) {
        console.error("Cartorium DEBUG | install failed:", err);
        ui.notifications.error(err.message);
      }

      } finally {
        btn.prop('disabled', false).html(originalBtnHtml);
      }
    });
  }
}

Hooks.on("renderSceneDirectory", (app, html, data) => {
    const htmlEl = html[0] || html; 
    if (htmlEl.querySelector(".cartorium-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("cartorium-btn");
    btn.innerHTML = '<i class="fas fa-user-shield"></i> Cartorium Vault';
    btn.style.flex = "1";
    btn.style.marginRight = "5px";
    btn.style.backgroundColor = "#2a4d4d"; 
    btn.style.color = "#00ffcc";
    btn.onclick = () => new CartoriumWindow().render(true);
    const headerActions = htmlEl.querySelector(".header-actions");
    if (headerActions) headerActions.insertAdjacentElement("afterbegin", btn);
});
