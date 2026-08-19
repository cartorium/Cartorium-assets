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
      height: 800,
      resizable: true
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

    // --- AUDIO FEEDBACK HELPER ---
    const playSfx = (type) => {
        let src = "";
        if (type === "click") src = "sounds/ui/click.ogg";
        if (type === "open") src = "sounds/ui/button-click.ogg";
        if (type === "success") src = "sounds/ui/coins.ogg";
        if(src) AudioHelper.play({src: src, volume: 0.5, autoplay: true}, false);
    };

    // ========================================================
    // --- PATREON DASHBOARD (Integrated) ---
    // ========================================================
    html.on('click', '.patreon-btn', (ev) => {
        ev.preventDefault();
        playSfx("click");
        const token = localStorage.getItem("cartorium-vault-token");
        const savedTime = localStorage.getItem("cartorium-token-timestamp");
        const isExpired = savedTime && (Date.now() - savedTime > (25 * 24 * 60 * 60 * 1000));
        const isLinked = token && !isExpired;
        const tier = localStorage.getItem("cartorium-user-tier") || "Active Patron";

        new Dialog({
            title: "Cartorium Account Dashboard",
            content: `
                <div style="text-align: center; padding: 10px;">
                    <h3 style="margin-top:0;">Status: ${isLinked ? "✅ Linked" : "❌ Not Linked"}</h3>
                    <p>Current Tier: <strong>${isLinked ? tier : "None"}</strong></p>
                    <hr>
                    <button id="open-patreon" class="patreon-btn" style="width:100%; margin-bottom:10px;">1. Open Patreon to Link</button>
                    <input type="text" id="p-code" placeholder="Paste Auth Code Here" style="width:100%; margin-bottom:10px; padding:5px;">
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
                            playSfx("success");
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
        }).render(true);
    });

    // ==========================================
    // --- TAB SWITCHING LOGIC (DYNAMIC 3-WINDOW) ---
    // ==========================================
    html.on('click', '.tab-btn', (ev) => {

        ev.preventDefault();
        playSfx("click");

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
    // --- DETAIL VIEW TIER TABS ---
    // ==========================================
    html.on('click', '.tier-tab-btn', (ev) => {
        ev.preventDefault();
        const btn = $(ev.currentTarget);
        
        // Block the click if they don't have access and give the right warning
        if (btn.hasClass('locked-tab')) {
            const target = btn.data('target');
            if (target === "tier3") {
                ui.notifications.warn("The Blood Sworn tier is required to unlock DM PDFs and Tokens.");
            } else {
                ui.notifications.warn("An active Patreon pledge is required to access the Vault.");
            }
            return;
        }

        playSfx("click");
        const target = btn.data('target');
        html.find('.tier-tab-btn').removeClass('active');
        btn.addClass('active');
        html.find('.tier-tab-content').removeClass('active');
        html.find(`#${target}-content`).addClass('active');
    });

    // ==========================================
    // --- OPEN DETAIL VIEW (App Store View) ---
    // ==========================================
    let currentMapData = null;
    const EXPIRY_IN_DAYS = 25; 
    const EXPIRY_MS = EXPIRY_IN_DAYS * 24 * 60 * 60 * 1000;

    html.on('click', '.open-detail-btn', (ev) => {
        playSfx("open");
        const card = ev.currentTarget;
        const mapId = card.dataset.id;
        
        // Failsafe: Prevent the WIP card from opening if clicked anyway
        if (mapId === "cartorium-wip-card") return;

        currentMapData = app.appData.find(m => m.id === mapId);
        if (!currentMapData) return ui.notifications.error("Could not load map details.");

        html.find('#detail-title').text(currentMapData.name);
        html.find('#detail-main-img').attr('src', currentMapData.thumb);
        html.find('#detail-description').text(currentMapData.description || "A highly detailed battlemap ready for your campaign.");

        let accessToken = localStorage.getItem("cartorium-vault-token");
        const savedTime = localStorage.getItem("cartorium-token-timestamp");
        const isExpired = savedTime && (Date.now() - savedTime > EXPIRY_MS);
        
        // Grab the tier BEFORE we evaluate the blur overlay
        const userTier = localStorage.getItem("cartorium-user-tier"); 

        const authOverlay = html.find('#detail-auth-overlay');

        // The vault ONLY un-blurs if they have a valid token AND an active tier
        if (accessToken && !isExpired && userTier && userTier !== "None" && userTier !== "Unknown") {
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

        // --- GREY OUT TABS BASED ON TIER ---
        const t2TabBtn = html.find('.tier-tab-btn[data-target="tier2"]');
        const t3TabBtn = html.find('.tier-tab-btn[data-target="tier3"]');
        
        // 1. Lock Tier 2 if they have no active pledge
        if (userTier === "None" || !userTier || userTier === "Unknown") {
            t2TabBtn.addClass('locked-tab');
            t2TabBtn.html('<i class="fas fa-lock"></i> VTT & Maps');
        } else {
            t2TabBtn.removeClass('locked-tab');
            t2TabBtn.html('<i class="fas fa-dungeon"></i> VTT & Maps');
        }

        // 2. Lock Tier 3 if they aren't Blood Sworn (or Creator)
        if (userTier !== "Blood Sworn" && userTier !== "Creator") {
            t3TabBtn.addClass('locked-tab');
            t3TabBtn.html('<i class="fas fa-lock"></i> DM\'s PDF & Tokens');
        } else {
            t3TabBtn.removeClass('locked-tab');
            t3TabBtn.html('<i class="fas fa-scroll"></i> DM\'s PDF & Tokens');
        }

        // We now only use Tier 2 and Tier 3
        const t2Container = html.find('#tier2-content').empty();
        const t3Container = html.find('#tier3-content').empty();

        // ==========================================
        // DYNAMIC VARIANT SWITCHER LOGIC
        // ==========================================
        const variantSelector = html.find('#variant-selector').empty();
        
        // Only show the switcher if the map actually has variants
        if (currentMapData.variants && currentMapData.variants.length > 0 && currentMapData.variants[0].name !== "") {
            variantSelector.append(`<button class="var-btn active" data-index="-1">Original Release</button>`);
            
            currentMapData.variants.forEach((v, index) => {
                variantSelector.append(`<button class="var-btn" data-index="${index}">${v.name}</button>`);
            });
        }

        // Helper function to build the Tier 2 Install Buttons
        app.renderInstallTab = (vIndex) => {
            t2Container.empty();
            
            if (vIndex === -1) {
                // RENDER ORIGINAL MAP FILES
                const baseImg = currentMapData.image8k || currentMapData.image4k || currentMapData.image4kFile;
                if (baseImg) {
                    t2Container.append(`<button class="action-btn install-btn silver-btn" data-type="unwalled"><i class="fas fa-image"></i> Install Map Only</button>`);
                }
                const baseJson = currentMapData.premiumJson || currentMapData.jsonFile;
                if (baseJson) {
                    t2Container.append(`<button class="action-btn install-btn gold-btn" data-type="walled"><i class="fas fa-dungeon"></i> Install VTT ready (walls, lights, doors)</button>`);
                }
            } else {
                // RENDER SPECIFIC VARIANT FILES
                const vData = currentMapData.variants[vIndex];
                if (vData.image) {
                    t2Container.append(`<button class="action-btn install-btn silver-btn" data-type="variant_${vIndex}_unwalled"><i class="fas fa-image"></i> Install Map Only</button>`);
                }
                if (vData.json) {
                    t2Container.append(`<button class="action-btn install-btn gold-btn" data-type="variant_${vIndex}_walled"><i class="fas fa-dungeon"></i> Install VTT ready (walls, lights, doors)</button>`);
                }
            }

            if (t2Container.children().length === 0) {
                t2Container.append(`<div class="empty-tier-msg">No files found for this version.</div>`);
            }
        };

        // Initialize with the Original Map (-1)
        app.renderInstallTab(-1);

        // ==========================================
        // TAB 2: BLOOD SWORN (PDFs & Tokens)
        // ==========================================
        let hasTier3Content = false;
        
        if (currentMapData.pdfUrl) {
            hasTier3Content = true;
            t3Container.append(`<a href="${currentMapData.pdfUrl}" target="_blank" class="action-btn download-btn blood-btn" style="display:block; text-align:center; text-decoration:none;"><i class="fas fa-file-pdf"></i> Download Adventure PDF</a>`);
        }
        
        if (currentMapData.tokens) {
            hasTier3Content = true;
            t3Container.append(`<button class="action-btn install-btn token-btn" data-type="tokens"><i class="fas fa-coins"></i> Install Token Pack</button>`);
        }

        if (!hasTier3Content) {
            t3Container.append(`<div class="locked-tier-preview"><h4>No Blood Sworn Exclusives Yet</h4><p>Adventure PDFs, encounter sheets, and token packs for this map will appear here.</p></div>`);
        }

        // ==========================================
        // MEMBERSHIP CARD DISPLAY LOGIC
        // ==========================================
        const membershipCard = html.find('#membership-card');
        const membershipImage = html.find('#membership-image');
        const membershipName = html.find('#membership-name');
        const membershipDesc = html.find('#membership-desc');

        const updateMembershipCard = (tier) => {
            membershipCard.removeClass('switching');
            void membershipCard[0].offsetWidth;
            membershipCard.addClass('switching');
            
            // Clear all tiers first
            membershipCard.removeClass('bronze-tier silver-tier gold-tier');
            
            if (tier === "tier2") {
                membershipCard.addClass('silver-tier');
                membershipImage.attr('src', 'modules/cartorium-browser/assets/silver-tier.webp');
                membershipName.text('Oath Forged');
                membershipDesc.text('Includes 8K canvases, immersive VTT scenes, walls, lighting, ambience and variants.');
            } else if (tier === "tier3") {
                membershipCard.addClass('gold-tier');
                membershipImage.attr('src', 'modules/cartorium-browser/assets/gold-tier.webp');
                membershipName.text('Blood Sworn');
                membershipDesc.text('Unlock DM PDFs, token packs, encounter sheets and legendary archive rewards.');
            }
        };

        html.find('.tier-tab-btn').off('click.membership');
        html.find('.tier-tab-btn').on('click.membership', function () {
            // --- FIX: Stop the card from switching if the tab is locked ---
            if ($(this).hasClass('locked-tab')) return; 
            
            const target = $(this).data('target');
            updateMembershipCard(target);
        });

        // Initialize to Tier 2 by default instead of Tier 1
        updateMembershipCard("tier2");
        html.find('.tier-tab-btn[data-target="tier2"]').click();
        
        setTimeout(() => rootEl.addClass('show-detail'), 50);
    });

    html.on('click', '.close-detail-btn', (ev) => {
        ev.preventDefault();
        playSfx("click");
        rootEl.removeClass('show-detail');
    });
    // ==========================================
    // --- VARIANT IMAGE & BUTTON SWITCHER ---
    // ==========================================
    html.on('click', '.var-btn', (ev) => {
        ev.preventDefault();
        playSfx("click");
        
        const btn = $(ev.currentTarget);
        html.find('.var-btn').removeClass('active');
        btn.addClass('active');
        
        const vIndex = parseInt(btn.data('index'));
        const mainImg = html.find('#detail-main-img');
        
        // Fade out image, swap source, fade in
        mainImg.css('opacity', '0.5');
        setTimeout(() => {
            if (vIndex === -1) {
                mainImg.attr('src', currentMapData.thumb);
            } else {
                const vData = currentMapData.variants[vIndex];
                mainImg.attr('src', vData.thumb || vData.image || currentMapData.thumb);
            }
            mainImg.css('opacity', '1');
        }, 150);

        // Update the install buttons on the right side
        app.renderInstallTab(vIndex);
    });

    // ==========================================
    // --- THE INSTALL PROCESS ---
    // ==========================================
    html.on('click', '.install-btn', async (ev) => {
      ev.preventDefault();
      if (!currentMapData) return;
      const type = ev.currentTarget.dataset.type; 
      const mapName = currentMapData.name;
      const mapId = currentMapData.id;
      
      let jsonFile = null, targetFile = null, displayVersion = "";

      if (type === "walled") {
          jsonFile = currentMapData.premiumJson || currentMapData.jsonFile;
          targetFile = currentMapData.premiumImage || currentMapData.imageFile;
          displayVersion = "Walled";
      } else if (type === "unwalled") {
          // Grabs the highest quality base image available in the JSON
          targetFile = currentMapData.image8k || currentMapData.image4k || currentMapData.image4kFile;
          displayVersion = "Unwalled";
      } else if (type.startsWith("variant_")) {
          const parts = type.split("_");
          const vIndex = parseInt(parts[1]);
          const vFileType = parts[2]; 
          const variant = currentMapData.variants[vIndex];
          
          if (vFileType === "walled") {
              jsonFile = variant.json;
              targetFile = variant.image;
              displayVersion = `Variant: ${variant.name} (Walled)`;
          } else {
              targetFile = variant.image;
              displayVersion = `Variant: ${variant.name} (Unwalled)`;
          }
      }

      let accessToken = localStorage.getItem("cartorium-vault-token");
      const savedTime = localStorage.getItem("cartorium-token-timestamp");
      const isExpired = savedTime && (Date.now() - savedTime > EXPIRY_MS);

      if (!accessToken || isExpired) {
        ui.notifications.error("Vault Session Invalid. Please click 'Link Patreon' to unlock.");
        return;
      }

      try {
        const imageUrl = `${workerBaseUrl}/?token=${accessToken}&mapId=${mapId}&file=${encodeURIComponent(targetFile)}`;
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error("Access Denied.");
        const imageBlob = await imageResponse.blob();
        
        const folderPath = "cartorium-vault-maps";
        try { await FilePicker.createDirectory("data", folderPath); } catch (e) {}
        const file = new File([imageBlob], `${mapId}_${type}_${Date.now()}.png`, { type: imageBlob.type });
        const uploadResult = await FilePicker.upload("data", folderPath, file);

        let sceneData = {};
        if (!!jsonFile) {
            const sceneResponse = await fetch(`${workerBaseUrl}/?token=${accessToken}&mapId=${mapId}&file=${encodeURIComponent(jsonFile)}`);
            sceneData = await sceneResponse.json();
            sceneData.background = { src: uploadResult.path };
            sceneData.name = `Cartorium: ${sceneData.name || mapName} (${displayVersion})`;
        } else {
            const imgObj = new Image();
            imgObj.src = URL.createObjectURL(imageBlob);
            await new Promise(r => imgObj.onload = r);
            sceneData = { name: `Cartorium: ${mapName} (${displayVersion})`, background: { src: uploadResult.path }, width: imgObj.width, height: imgObj.height };
        }

        const importedScene = await Scene.create(sceneData);
        if (importedScene) {
          playSfx("success");
          ui.notifications.info(`SUCCESS: ${mapName} deployed.`);
          importedScene.view();
        }
      } catch (err) { ui.notifications.error(err.message); }
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