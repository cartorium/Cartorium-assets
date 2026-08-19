class CartoriumWindow extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cartorium-ui",
      title: "Cartorium Map Hub",
      template: "modules/cartorium-browser/browser.html",
      width: 1280,
      height: 765,
      resizable: true
    });
  }

  async getData() {
    try {
      const cacheBuster = Date.now();
      const response = await fetch(`https://raw.githubusercontent.com/cartorium/Cartorium-assets/main/map-directory.json?t=${cacheBuster}`);
      if (!response.ok) throw new Error(`Directory fetch failed`);
      return { maps: await response.json() };
    } catch (error) {
      console.error("Cartorium | Menu Error:", error);
      ui.notifications.error("Cartorium: Unable to connect to the live map directory.");
      return { maps: [] }; 
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    const workerBaseUrl = "https://cartorium-gatekeeper.boatofdoom.workers.dev";

    // ==========================================
    // --- TAB SWITCHING LOGIC ---
    // ==========================================
    html.on('click', '.tab-btn', (ev) => {
        ev.preventDefault();
        const btn = ev.currentTarget;
        const target = btn.dataset.tab;

        // Swap the "active" highlight
        html.find('.tab-btn').removeClass('active');
        btn.classList.add('active');

        // Filter the map cards AND toggle the Hero mode
        const cards = html.find('.map-card');
        const grid = html.find('.map-grid');

        if (target === "all") {
            grid.removeClass('showcase-mode'); // Turns OFF the Hero Card sizes
            cards.css("display", "block"); 
        } else if (target === "featured") {
            grid.addClass('showcase-mode'); // Turns ON the Hero Card sizes
            cards.each(function() {
                if (this.dataset.featured === "true" || this.dataset.featured === true) {
                    $(this).css("display", "block");
                } else {
                    $(this).css("display", "none");
                }
            });
        }
    });

    const EXPIRY_IN_DAYS = 25; 
    const EXPIRY_MS = EXPIRY_IN_DAYS * 24 * 60 * 60 * 1000;

    html.on('click', '.import-btn', async (ev) => {
      ev.preventDefault();
      const btn = ev.currentTarget;
      const card = btn.closest('.map-card');
      
      const mapName = btn.dataset.name;
      const mapId = btn.dataset.id;
      const jsonFile = btn.dataset.json;
      const imgFile = btn.dataset.img;
      const img4kFile = btn.dataset.img4k;
      const version = card.querySelector('.version-select').value;
      const isPremium = version === "premium";

      let accessToken = localStorage.getItem("cartorium-vault-token");
      const savedTime = localStorage.getItem("cartorium-token-timestamp");
      const isExpired = savedTime && (Date.now() - savedTime > EXPIRY_MS);

      if (!accessToken || isExpired) {
        localStorage.removeItem("cartorium-vault-token");
        localStorage.removeItem("cartorium-token-timestamp");

        const userCode = await new Promise(resolve => {
          new Dialog({
            title: "Vault Access",
            content: `<p>Paste your Patreon Auth Code (Click 'Link Patreon' to get a fresh one):</p><input type="text" id="p-code" style="width:100%">`,
            buttons: {
              ok: { label: "Unlock", callback: (h) => resolve(h.find("#p-code").val()) },
              cancel: { label: "Cancel", callback: () => resolve(null) }
            }
          }).render(true);
        });

        if (!userCode) return;

        ui.notifications.info("Vault: Establishing Secure Connection...");
        
        try {
          const tokenResp = await fetch(`${workerBaseUrl}/?code=${userCode.trim()}`);
          const tokenData = await tokenResp.json();
          accessToken = tokenData.access_token || userCode.trim();

          if (!accessToken || tokenData.error) throw new Error("Patreon denied the code.");

          localStorage.setItem("cartorium-vault-token", accessToken);
          localStorage.setItem("cartorium-token-timestamp", Date.now());
        } catch (err) {
          return ui.notifications.error(`Vault Error: ${err.message}`);
        }
      }

      try {
        ui.notifications.info(`Vault: Fetching fresh assets for ${mapName}...`);
        
        let targetFile = isPremium ? imgFile : (img4kFile || imgFile);
        const imageUrl = `${workerBaseUrl}/?token=${accessToken}&mapId=${mapId}&file=${encodeURIComponent(targetFile)}`;
        
        const imageResponse = await fetch(imageUrl);

        if (imageResponse.status === 403 || imageResponse.status === 401) {
            localStorage.removeItem("cartorium-vault-token");
            throw new Error("Vault Session Invalid. Please click 'Link Patreon' for a fresh code.");
        }

        if (!imageResponse.ok) throw new Error("Access Denied to Artwork.");
        
        const imageBlob = await imageResponse.blob();
        const folderPath = "cartorium-vault-maps";
        try { await FilePicker.createDirectory("data", folderPath); } catch (e) {}
        
        const fileExt = targetFile.split('.').pop().toLowerCase();
        const cleanId = mapId.replace(/[^a-zA-Z0-9]/g, "_");
        const cacheBuster = Math.floor(Date.now() / 1000);
        const localFileName = `${cleanId}_${isPremium ? 'premium' : '4k'}_${cacheBuster}.${fileExt}`; 
        
        const file = new File([imageBlob], localFileName, { type: imageBlob.type });
        const uploadResult = await FilePicker.upload("data", folderPath, file);

        let sceneData = {};
        
        if (isPremium) {
            ui.notifications.info(`Vault: Stabilizing Blueprints for ${mapName}...`);
            const jsonUrl = `${workerBaseUrl}/?token=${accessToken}&mapId=${mapId}&file=${encodeURIComponent(jsonFile)}`;
            const sceneResponse = await fetch(jsonUrl);
            sceneData = await sceneResponse.json();

            sceneData.background = sceneData.background || {};
            sceneData.background.src = uploadResult.path;

            delete sceneData.img;      
            delete sceneData._id;      
            delete sceneData.ownership;
            delete sceneData.folder;   
            delete sceneData.sort;     
            delete sceneData.active;   
            delete sceneData.thumb;    
            
            sceneData.name = `Cartorium: ${sceneData.name || mapName}`;
            
        } else {
            ui.notifications.info(`Vault: Calibrating 4K Canvas...`);
            const imgObj = new Image();
            imgObj.src = URL.createObjectURL(imageBlob);
            await new Promise(r => imgObj.onload = r);

            sceneData = {
                name: `Cartorium: ${mapName} (4K)`,
                background: { src: uploadResult.path },
                width: imgObj.width,
                height: imgObj.height,
                padding: 0.25,
                grid: { type: 1, size: 100 }
            };
        }

        const importedScene = await Scene.create(sceneData);
        if (importedScene) {
          ui.notifications.info(`SUCCESS: ${mapName} deployed and visible.`);
          importedScene.view();
        }
      } catch (err) {
        console.error(`Cartorium | CRITICAL VAULT ERROR ON ${mapName}:`, err);
        ui.notifications.error(`Vault Error: ${err.message}`);
      }
    });
  }
}

Hooks.on("renderSceneDirectory", (app, html, data) => {
    if (html.querySelector(".cartorium-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("cartorium-btn");
    btn.innerHTML = '<i class="fas fa-user-shield"></i> Cartorium Vault';
    btn.style.flex = "1";
    btn.style.marginRight = "5px";
    btn.style.backgroundColor = "#2a4d4d"; 
    btn.style.color = "#00ffcc";
    btn.onclick = (event) => {
        event.preventDefault();
        new CartoriumWindow().render(true);
    };
    const headerActions = html.querySelector(".header-actions");
    if (headerActions) {
        headerActions.insertAdjacentElement("afterbegin", btn);
    }
});

Hooks.once("ready", () => {
    ui.notifications.info("Cartorium Hub: Secure Connection Established.");
});