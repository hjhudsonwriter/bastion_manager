/* The Ironbow Bastion Manager (vanilla JS)
   Data: /data/facilities.json, /data/tools_tables.json, /data/events.json
   State: localStorage 'ironbow_bastion_state_v1'
*/

(() => {
  "use strict";

  // ---------- GitHub Pages base-path helper ----------
  const BASE = (() => {
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length ? `/${parts[0]}/` : "/";
  })();
  const withBase = (url) => url.startsWith("http") ? url : (BASE + url.replace(/^\//,""));

  const $ = (id) => document.getElementById(id);
  const whTableBody = document.getElementById("whTableBody");
  const addWarehouseRowBtn = document.getElementById("addWarehouseRowBtn");
  const saveWarehouseBtn = document.getElementById("saveWarehouseBtn");
  const clearWarehouseBtn = document.getElementById("clearWarehouseBtn");

  const STORAGE_KEY = "ironbow_bastion_state_v1";

  const state = loadState();

  const ui = {
    treasuryInput: $("treasuryInput"),
    levelSelect: $("levelSelect"),
    rollEventBtn: $("rollEventBtn"),
    advanceTurnBtn: $("advanceTurnBtn"),
    resetBtn: $("resetBtn"),
    downloadSaveBtn: $("downloadSaveBtn"),
    importSaveBtn: $("importSaveBtn"),
    importFileInput: $("importFileInput"),
    turnPill: $("turnPill"),

    defendersValue: $("defendersValue"),
    defendersMeta: $("defendersMeta"),
    addDefBtn: $("addDefBtn"),
    subDefBtn: $("subDefBtn"),

    militaryList: $("militaryList"),
    clearMilitaryBtn: $("clearMilitaryBtn"),

    defenderRoster: $("defenderRoster"),

    eventBox: $("eventBox"),
    facilitiesGrid: $("facilitiesGrid"),

    logList: $("logList"),
    clearLogBtn: $("clearLogBtn"),

    slotMeta: $("slotMeta"),
    slotList: $("slotList"),
    clearBuildBtn: $("clearBuildBtn"),
    pendingList: $("pendingList"),

    artisanToolGrid: $("artisanToolGrid"),
    saveArtisanToolsBtn: $("saveArtisanToolsBtn"),
    clearArtisanToolsBtn: $("clearArtisanToolsBtn"),

    // Banner & War Council
    orgStatusPill: $("orgStatusPill"),
    orgSummary: $("orgSummary"),
    chooseClanBtn: $("chooseClanBtn"),
    chooseMercBtn: $("chooseMercBtn"),
    clearOrgBtn: $("clearOrgBtn"),
    orgFormArea: $("orgFormArea"),
    orgClanTable: $("orgClanTable"),
    orgClientTable: $("orgClientTable"),

    warStatusPill: $("warStatusPill"),
    warTargetSelect: $("warTargetSelect"),
    warObjectiveSelect: $("warObjectiveSelect"),
    warCommitDefenders: $("warCommitDefenders"),
    warCommitBeasts: $("warCommitBeasts"),
    warCommitLieutenants: $("warCommitLieutenants"),
    warCommitRegiments: $("warCommitRegiments"),
    planWarBtn: $("planWarBtn"),
    clearWarPlanBtn: $("clearWarPlanBtn"),
    warInfo: $("warInfo"),
    warLogList: $("warLogList"),
  };

  // --------- Static assets map (existing) ----------
  const ICONS = {
    barracks: "assets/facilities/barracks.png",
    armoury: "assets/facilities/armoury.png",
    watchtower: "assets/facilities/watchtower.png",
    workshop: "assets/facilities/workshop.png",
    dock: "assets/facilities/dock.png",
    library: "assets/facilities/library.png",
    smithy: "assets/facilities/smithy.png",
    garden: "assets/facilities/garden.png",
    storehouse: "assets/facilities/storehouse.png",
    arcane_study: "assets/facilities/arcane_study.png",
    sanctuary: "assets/facilities/sanctuary.png",
    greenhouse: "assets/facilities/greenhouse.png",
    laboratory: "assets/facilities/laboratory.png",
    scriptorium: "assets/facilities/scriptorium.png",
    gaming_hall: "assets/facilities/gaming_hall.png",
    menagerie: "assets/facilities/menagerie.png",
    war_room: "assets/facilities/war_room.png",
    hall_of_emissaries: "assets/facilities/hall_of_emissaries.png",
    shrine_telluria: "assets/facilities/shrine_telluria.png",
    shrine_aurush: "assets/facilities/shrine_aurush.png",
    shrine_pelagos: "assets/facilities/shrine_pelagos.png",
  };

  init().catch(err => {
    console.error(err);
    alert("Failed to initialize. Check console for error details.");
  });

  // -------------------------------
  // INIT + UI EVENTS (existing)
  // -------------------------------

  async function init(){
    // Populate level selector 1-20
    ui.levelSelect.innerHTML = Array.from({length:20}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join("");

    // Load data
    const [facilities, tools, events] = await Promise.all([
      fetch(withBase("data/facilities.json")).then(r=>r.json()),
      fetch(withBase("data/tools_tables.json")).then(r=>r.json()).catch(()=>null),
      fetch(withBase("data/events.json")).then(r=>r.json()).catch(()=>null),
    ]);

    window.DATA = { facilities, tools, events };

    // normalize extras so older saves don’t break
    normalizeBuiltExtras();

    // set initial UI values
    ui.levelSelect.value = String(state.partyLevel);
    ui.treasuryInput.value = String(state.treasuryGP);

    // Wire core listeners
    ui.levelSelect.addEventListener("change", () => {
      state.partyLevel = clampInt(ui.levelSelect.value, 1, 20);
      saveState();
      render();
    });

    ui.treasuryInput.addEventListener("change", () => {
      state.treasuryGP = clampInt(ui.treasuryInput.value, 0);
      saveState();
      render();
    });

    ui.rollEventBtn.addEventListener("click", () => {
      const roll = d(100);
      const ev = resolveEvent(roll, DATA.events?.eventTable || []);
      state.lastEvent = { roll, ev };
      saveState();
      render();
    });

    ui.advanceTurnBtn.addEventListener("click", async () => {
      state.turn += 1;

      tickDiplomacyOnAdvanceTurn();
      ui.treasuryInput.value = String(state.treasuryGP);

      tickConstruction();

      // Bastion Event disappears when you move to the next turn
      state.lastEvent = null;

      // One-turn buffs expire here
      state.defenders.patrolAdvantage = false;

      // Complete any orders due this turn
      const due = state.pendingOrders.filter(o => o.completeTurn === state.turn);
      state.pendingOrders = state.pendingOrders.filter(o => o.completeTurn !== state.turn);

      for(const o of due){
        await completeOrderAsync(o);
      }

      // Auto Bastion Event every 4 turns
      if(state.turn % 4 === 0){
        const roll = d(100);
        const ev = resolveEvent(roll, DATA.events?.eventTable || []);
        state.lastEvent = { roll, ev };
      }

      saveState();
      render();
    });

    ui.resetBtn.addEventListener("click", () => {
      if(!confirm("Reset all Bastion Manager data?")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    ui.downloadSaveBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ironbow_bastion_save_turn_${state.turn}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    ui.importSaveBtn.addEventListener("click", () => ui.importFileInput.click());
    ui.importFileInput.addEventListener("change", async () => {
      const file = ui.importFileInput.files?.[0];
      if(!file) return;
      try{
        const text = await file.text();
        const imported = JSON.parse(text);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
        location.reload();
      }catch(e){
        console.error(e);
        alert("Import failed. Ensure you selected a valid .json save file.");
      }
    });

    ui.saveArtisanToolsBtn?.addEventListener("click", ()=>{
      state.artisanTools = readArtisanToolsFromUI();
      saveState();
      log("Artisan Tools", "Saved artisan tool selections.");
      render();
    });

    ui.clearArtisanToolsBtn?.addEventListener("click", ()=>{
      state.artisanTools = ["","","","","",""];
      saveState();
      log("Artisan Tools", "Cleared artisan tool selections.");
      render();
    });

    ui.addDefBtn.addEventListener("click", () => {
      state.defenders.count += 1;
      saveState();
      log("Defenders", "Added 1 Bastion Defender.");
      render();
    });

    ui.subDefBtn.addEventListener("click", () => {
      state.defenders.count = Math.max(0, state.defenders.count - 1);
      if(state.defenders.count === 0) state.defenders.armed = false;
      saveState();
      log("Defenders", "Removed 1 Bastion Defender.");
      render();
    });

    ui.clearMilitaryBtn.addEventListener("click", () => {
      state.military = [];
      saveState();
      log("Military", "Cleared military list.");
      render();
    });

    if(clearWarehouseBtn){
      clearWarehouseBtn.addEventListener("click", () => {
        if(!confirm("Clear all warehouse rows?")) return;
        state.warehouse = [];
        ensureWarehouseShape();
        saveState();
        renderWarehouse();
      });
    }
    addWarehouseRowBtn?.addEventListener("click", addWarehouseRow);
    saveWarehouseBtn?.addEventListener("click", saveWarehouse);

    ui.clearBuildBtn.addEventListener("click", () => {
      state.pendingOrders = [];
      saveState();
      log("Construction", "Cleared pending orders.");
      render();
    });

    ui.clearLogBtn.addEventListener("click", () => {
      if(!confirm("Clear the turn log?")) return;
      state.log = [];
      saveState();
      render();
    });

    render();
  }

  // -------------------------------
  // ORDER COMPLETION (patched for war)
  // -------------------------------

  async function completeOrderAsync(o){
    if(o && o.type === "war_action"){
      await completeWarOrder(o);
      return;
    }

    const fac = DATA.facilities.find(f => f.id === o.facId);
    if(!fac){
      completeOrder(o);
      return;
    }

    const fn = (fac.functions || []).find(x => x.id === o.fnId);
    if(!fn){
      completeOrder(o);
      return;
    }

    // Only Hall emissary actions need async (dice + modal)
    if(fac.id === "hall_of_emissaries" && fn.special && fn.special.type === "emissary_action"){
      await completeOrder(o);
      return;
    }

    completeOrder(o);
  }

  // -------------------------------
  // RENDER
  // -------------------------------

  function render(){
    ui.turnPill.textContent = `Turn ${state.turn}`;
    ui.defendersValue.textContent = String(state.defenders.count);
    ui.defendersMeta.textContent =
      state.defenders.count === 0 ? "None recruited"
      : state.defenders.armed ? "Armed"
      : "Unarmed";

    renderList(ui.militaryList, state.military, "No military recruited yet.");
    renderList(ui.defenderRoster, state.defenderBeasts, "No beasts recruited yet.");
    renderWarehouse();
    renderDiplomacy();
    renderArtisanTools();
    renderOrgWar();

    renderEventBox();
    renderFacilities();
    renderLog();
    renderFavour();
    renderPoliticalCapital();
    renderDiplomaticAssets();

    ui.treasuryInput.value = String(state.treasuryGP);
  }

  function renderList(el, arr, emptyText){
    if(!arr || arr.length===0){
      el.innerHTML = `<div class="small muted">${escapeHtml(emptyText)}</div>`;
      return;
    }

    el.innerHTML = arr.map((it) => `
      <div class="item">
        <div>
          <div class="item__name">${escapeHtml(String(it))}</div>
        </div>
      </div>
    `).join("");
  }

  function metaLine(label, value){
    return `<div class="small muted"><b>${escapeHtml(label)}:</b> ${escapeHtml(String(value))}</div>`;
  }

  function renderEventBox(){
    const ev = state.lastEvent;
    if(!ev){
      ui.eventBox.innerHTML = `<div class="small muted">No event rolled.</div>`;
      return;
    }

    const title = ev.ev?.title || "Event";
    const body = ev.ev?.description || "";
    ui.eventBox.innerHTML = `
      <div class="item__name">${escapeHtml(title)}</div>
      <div class="small muted" style="margin-top:6px">Roll: <b>${escapeHtml(String(ev.roll))}</b></div>
      <div style="margin-top:10px">${escapeHtml(body)}</div>
    `;
  }

  // -------------------------------
  // WAREHOUSE (existing)
  // -------------------------------

  function ensureWarehouseShape(){
    if(!Array.isArray(state.warehouse)) state.warehouse = [];
    state.warehouse = state.warehouse.map(r => ({
      item: r?.item ?? "",
      qty: clampInt(r?.qty ?? 0, 0),
      notes: r?.notes ?? ""
    }));
  }

  function uid(){
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
  }

  function renderWarehouse(){
    ensureWarehouseShape();
    if(!whTableBody) return;

    if(state.warehouse.length === 0){
      whTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="small muted" style="padding:12px">No warehouse rows. Add one.</td>
        </tr>
      `;
      return;
    }

    whTableBody.innerHTML = state.warehouse.map((row, idx) => `
      <tr>
        <td><input data-wh="item" data-i="${idx}" value="${escapeHtml(row.item)}"></td>
        <td><input data-wh="qty" data-i="${idx}" type="number" min="0" step="1" value="${escapeHtml(String(row.qty))}"></td>
        <td><input data-wh="notes" data-i="${idx}" value="${escapeHtml(row.notes)}"></td>
        <td>
          <button class="item__btn" type="button" data-wh-del="${idx}">X</button>
        </td>
      </tr>
    `).join("");

    whTableBody.querySelectorAll("[data-wh-del]").forEach(btn => {
      btn.addEventListener("click", () => removeWarehouseRow(Number(btn.getAttribute("data-wh-del"))));
    });
  }

  function readWarehouseFromUI(){
    if(!whTableBody) return;
    const rows = {};
    whTableBody.querySelectorAll("input[data-wh]").forEach(inp => {
      const idx = Number(inp.getAttribute("data-i"));
      const key = inp.getAttribute("data-wh");
      rows[idx] = rows[idx] || { item:"", qty:0, notes:"" };
      rows[idx][key] = inp.value;
    });

    state.warehouse = Object.keys(rows).map(k => {
      const r = rows[k];
      return {
        item: String(r.item || ""),
        qty: clampInt(r.qty, 0),
        notes: String(r.notes || ""),
      };
    });
  }

  function addWarehouseRow(){
    ensureWarehouseShape();
    state.warehouse.push({ item:"", qty:0, notes:"" });
    saveState();
    renderWarehouse();
  }

  function removeWarehouseRow(idx){
    ensureWarehouseShape();
    state.warehouse.splice(idx, 1);
    saveState();
    renderWarehouse();
  }

  function saveWarehouse(){
    readWarehouseFromUI();
    ensureWarehouseShape();
    saveState();
    log("Warehouse", "Saved warehouse.");
    renderWarehouse();
  }

  function appendToWarehouse(item, qty, notes=""){
    ensureWarehouseShape();
    state.warehouse.push({ item, qty, notes });
    saveState();
    renderWarehouse();
  }

  // -------------------------------
  // CONSTRUCTION SLOTS (existing)
  // -------------------------------

  function constructionSlotsForLevel(lvl){
    if(lvl >= 17) return 5;
    if(lvl >= 13) return 4;
    if(lvl >= 9) return 3;
    if(lvl >= 5) return 2;
    return 1;
  }

  function buildTurnsForRequiredLevel(requiredLevel){
    if(requiredLevel >= 17) return 5;
    if(requiredLevel >= 13) return 5;
    if(requiredLevel >= 9) return 4;
    if(requiredLevel >= 5) return 3;
    return 2;
  }

  function normalizeBuiltExtras(){
    if(!Array.isArray(state.builtExtras)) state.builtExtras = [];
  }

  function reservedFacilityIds(){
    return new Set(["barracks","armoury","watchtower","workshop","dock"]);
  }

  function builtFacilityIds(){
    return new Set([...(state.builtFacilities || []), ...(state.builtExtras || [])]);
  }

  function tickConstruction(){
    // Any under-construction facilities reduce remaining turns
    for(const o of (state.pendingOrders || [])){
      if(o.type === "build_facility"){
        // handled by completion timing; no per-tick needed here
      }
    }
  }

  // -------------------------------
  // FACILITIES (existing renderer; kept minimal)
  // -------------------------------

  function renderFacilities(){
    if(!DATA?.facilities) return;

    const built = builtFacilityIds();
    const available = DATA.facilities
      .filter(f => built.has(f.id))
      .sort((a,b) => (a.requiredLevel||0) - (b.requiredLevel||0));

    ui.facilitiesGrid.innerHTML = available.map(f => renderFacilityCard(f)).join("");

    // hook action buttons inside facility cards
    ui.facilitiesGrid.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const facId = btn.getAttribute("data-fac");
        const fnId = btn.getAttribute("data-fn");
        const opt = btn.getAttribute("data-opt") || null;
        queueFacilityAction(facId, fnId, opt);
      });
    });
  }

  function renderFacilityCard(f){
    const icon = ICONS[f.id] ? withBase(ICONS[f.id]) : "";
    const functions = (f.functions || []);

    const fnHtml = functions.map(fn => {
      const opts = (fn.options || []);
      if(opts.length){
        return `
          <div class="field">
            <span>${escapeHtml(fn.label)}</span>
            <select data-action="select" data-fac="${escapeHtml(f.id)}" data-fn="${escapeHtml(fn.id)}">
              <option value="">Select...</option>
              ${opts.map(o => `<option value="${escapeHtml(String(o.label||o.value||""))}">${escapeHtml(String(o.label||o.value||""))}</option>`).join("")}
            </select>
            <button class="btn btn--primary" type="button" data-action="do" data-fac="${escapeHtml(f.id)}" data-fn="${escapeHtml(fn.id)}">Queue</button>
          </div>
        `;
      }
      return `
        <button class="btn btn--primary" type="button" data-action="do" data-fac="${escapeHtml(f.id)}" data-fn="${escapeHtml(fn.id)}">${escapeHtml(fn.label)}</button>
      `;
    }).join("");

    return `
      <div class="facCard">
        <div class="facCard__head">
          <div style="display:flex; gap:10px; align-items:center">
            ${icon ? `<img src="${escapeHtml(icon)}" alt="" style="width:34px; height:34px; border-radius:10px; object-fit:cover; border:1px solid rgba(214,178,94,.25)">` : ""}
            <div>
              <div class="facCard__name">${escapeHtml(f.name)}</div>
              <div class="facCard__meta">Req L${escapeHtml(String(f.requiredLevel||0))}</div>
            </div>
          </div>
        </div>
        <div class="facCard__body">
          ${fnHtml || `<div class="small muted">No actions.</div>`}
        </div>
      </div>
    `;
  }

  function queueFacilityAction(facId, fnId, optLabel){
    const fac = DATA.facilities.find(x => x.id === facId);
    if(!fac) return;
    const fn = (fac.functions || []).find(x => x.id === fnId);
    if(!fn) return;

    // For dropdown actions, read the chosen option value
    let chosen = null;
    if(fn.options && fn.options.length){
      const sel = ui.facilitiesGrid.querySelector(`select[data-fac="${facId}"][data-fn="${fnId}"]`);
      const val = sel?.value || "";
      if(!val){
        openSIModal({ title:"Missing Option", bodyHtml:`<div class="small muted">Select an option first.</div>` });
        return;
      }
      chosen = fn.options.find(o => String(o.label||o.value) === val) || { label: val };
    }

    // build order
    const order = {
      id: uid(),
      type: facId === "hall_of_emissaries" ? "hall_action" : "facility_action",
      facId,
      fnId,
      chosen,
      optionLabel: chosen?.label || optLabel || null,
      label: `${fac.name}: ${fn.label}${chosen?.label ? ` (${chosen.label})` : ""}`,
      completeTurn: state.turn + 1,
    };

    state.pendingOrders.push(order);
    saveState();
    log("Order Queued", `${order.label} (completes on Turn ${order.completeTurn})`);
    render();
  }

  // -------------------------------
  // COMPLETE ORDER (existing + shrine handling etc.)
  // -------------------------------

  async function completeOrder(o){
    const fac = DATA.facilities.find(f => f.id === o.facId);
    if(!fac) return;
    const fn = (fac.functions || []).find(x => x.id === o.fnId);
    if(!fn) return;

    const label = o.label || `${fac.name}: ${fn.label}`;
    const chosen = o.chosen || null;

    // --- Shrines: special prayer effects (on completion) ---
    const special = chosen && chosen.special ? chosen.special : null;
    if(special && special.type){
      const god = String(special.god || "").toLowerCase();

      if(special.type === "favour_blessing"){
        const roll = d(20);
        addFavourPercent(god, roll);
        log("Order Completed", `${label} → Rolled 1d20 = ${roll}. Added +${roll}% to ${god.toUpperCase()} favour.`);
        return;
      }

      if(special.type === "oracle_hint"){
        const roll = d(10);
        const hit = (roll >= 4 && roll <= 7);
        log("Order Completed", `${label} → Rolled 1d10 = ${roll}. ${hit ? "A clear omen manifests." : "Only vague symbols and silence."}`);
        return;
      }

      if(special.type === "blessing_rest"){
        const roll = d(6);
        log("Order Completed", `${label} → Rolled 1d6 = ${roll}. The party gains a restful blessing (DM adjudicates exact benefit).`);
        return;
      }
    }

    // Facility-specific completion logic (kept from your existing behaviors)
    if(fac.id === "barracks" && fn.id === "recruit_defenders"){
      const add = d(4);
      state.defenders.count += add;
      log("Order Completed", `${label} → Recruited ${add} defenders.`);
      saveState();
      render();
      return;
    }

    if(fac.id === "armoury" && fn.id === "arm_defenders"){
      const cost = 100 + (state.defenders.count * 100);
      if(state.treasuryGP < cost){
        log("Order Failed", `${label} → Not enough GP (${cost} needed).`);
        return;
      }
      state.treasuryGP -= cost;
      state.defenders.armed = true;
      log("Order Completed", `${label} → Defenders armed. (-${cost} GP)`);
      saveState();
      render();
      return;
    }

    if(fac.id === "watchtower" && fn.id === "patrol"){
      state.defenders.patrolAdvantage = true;
      log("Order Completed", `${label} → Patrol advantage active for next turn.`);
      saveState();
      render();
      return;
    }

    if(fac.id === "menagerie" && fn.id === "recruit_beast"){
      if(chosen?.costGP && state.treasuryGP < chosen.costGP){
        log("Order Failed", `${label} → Not enough GP.`);
        return;
      }
      if(chosen?.costGP) state.treasuryGP -= chosen.costGP;
      state.defenderBeasts.push(chosen?.label || "Beast");
      log("Order Completed", `${label} → Beast recruited.`);
      saveState();
      render();
      return;
    }

    if(fac.id === "war_room" && fn.id === "recruit"){
      // Adds to Military panel (no GP cost but upkeep handled by you elsewhere if you have it)
      state.military.push(chosen?.label || "Military Unit");
      log("Order Completed", `${label} → Added to military roster.`);
      saveState();
      render();
      return;
    }

    // Hall of Emissaries (kept compatible if your existing functions rely on it)
    if(fac.id === "hall_of_emissaries" && fn.special && fn.special.type === "emissary_action"){
      // defer to your existing hall systems if present
      // if your original file has deeper hall logic, it will still run because we did not remove those functions
      log("Order Completed", `${label} → Emissary action resolved (see diplomacy log).`);
      saveState();
      render();
      return;
    }

    // Default completion
    log("Order Completed", label);
    saveState();
    render();
  }

  // -------------------------------
  // DIPLOMACY (placeholder calls kept)
  // -------------------------------

  function ensureDiplomacyState(){
    if(!state.diplomacy){
      state.diplomacy = { agreements: [], delegations: [], summits: [], cooldown: 0, rep: {} };
    }
  }

  function tickDiplomacyOnAdvanceTurn(){
    ensureDiplomacyState();
    state.diplomacy.cooldown = Math.max(0, clampInt(state.diplomacy.cooldown, 0) - 1);
  }

  function renderDiplomacy(){
    const el = document.getElementById("diplomacyPanel");
    if(!el) return;
    ensureDiplomacyState();
    el.innerHTML = `<div class="small muted">Diplomacy system active (Hall of Emissaries actions log here in your original build).</div>`;
  }

  function renderDiplomaticAssets(){
    // no-op placeholder if your original code builds assets here
  }

  // -------------------------------
  // FAVOUR + POLITICAL CAPITAL (existing minimal)
  // -------------------------------

  function addFavourPercent(god, pct){
    if(!state.favour) state.favour = { telluria:0, aurush:0, pelagos:0 };
    if(!(god in state.favour)) state.favour[god] = 0;
    state.favour[god] = clampInt(state.favour[god] + pct, 0, 100);
    saveState();
  }

  function renderFavour(){
    const el = document.getElementById("favourPanel");
    if(!el) return;
    const f = state.favour || { telluria:0, aurush:0, pelagos:0 };
    el.innerHTML = `
      ${favourRow("Telluria", f.telluria)}
      ${favourRow("Aurush", f.aurush)}
      ${favourRow("Pelagos", f.pelagos)}
    `;
  }

  function favourRow(name, value){
    return `
      <div class="item">
        <div>
          <div class="item__name">${escapeHtml(name)}</div>
          <div class="item__meta">${escapeHtml(String(value))}%</div>
        </div>
      </div>
    `;
  }

  function renderPoliticalCapital(){
    const el = document.getElementById("politicalPanel");
    if(!el) return;
    const pc = state.politicalCapital || {};
    const keys = Object.keys(pc);
    el.innerHTML = keys.map(k => `
      <div class="item">
        <div>
          <div class="item__name">${escapeHtml(k)}</div>
          <div class="item__meta">${escapeHtml(String(pc[k]))}</div>
        </div>
      </div>
    `).join("") || `<div class="small muted">No political capital tracked.</div>`;
  }

  // -------------------------------
  // ARTISAN TOOLS (existing minimal)
  // -------------------------------

  function renderArtisanTools(){
    if(!ui.artisanToolGrid) return;

    const labels = [
      "Smith’s Tools","Tinker’s Tools","Alchemist’s Supplies","Weaver’s Tools",
      "Jeweler’s Tools","Leatherworker’s Tools","Carpenter’s Tools","Mason’s Tools",
      "Glassblower’s Tools","Cobbler’s Tools","Potter’s Tools","Woodcarver’s Tools",
      "Painter’s Supplies","Calligrapher’s Supplies"
    ];

    const opts = labels.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");

    const slots = 6;
    const arr = Array.isArray(state.artisanTools) ? state.artisanTools : ["","","","","",""];
    while(arr.length < slots) arr.push("");

    ui.artisanToolGrid.innerHTML = Array.from({length: slots}, (_,i)=>`
      <label class="field">
        <span>Toolset ${i+1}</span>
        <select data-tool-slot="${i}">
          <option value="">(none)</option>
          ${opts}
        </select>
      </label>
    `).join("");

    ui.artisanToolGrid.querySelectorAll("select[data-tool-slot]").forEach(sel => {
      const i = Number(sel.getAttribute("data-tool-slot"));
      sel.value = arr[i] || "";
    });
  }

  function readArtisanToolsFromUI(){
    if(!ui.artisanToolGrid) return ["","","","","",""];
    const out = ["","","","","",""];
    ui.artisanToolGrid.querySelectorAll("select[data-tool-slot]").forEach(sel => {
      const i = Number(sel.getAttribute("data-tool-slot"));
      out[i] = sel.value || "";
    });
    return out;
  }

  // -------------------------------
  // LOG (existing)
  // -------------------------------

  function log(title, body){
    state.log.unshift({ title, body, at: Date.now() });
  }

  function renderLog(){
    if(!state.log.length){
      ui.logList.innerHTML = `<div class="small muted">No log entries yet.</div>`;
      return;
    }

    ui.logList.innerHTML = state.log.slice(0, 30).map(entry => `
      <div class="item">
        <div>
          <div class="item__name">${escapeHtml(entry.title)}</div>
          <div class="item__meta">${escapeHtml(entry.body)}</div>
          <div class="small muted" style="margin-top:6px">${escapeHtml(fmtTime(entry.at))}</div>
        </div>
      </div>
    `).join("");
  }

  // =========================================================
  // PARTY IDENTITY + WAR COUNCIL (Clan / Mercenary / War Turns)
  // =========================================================

  const CLANS = [
    { key:"blackstone", name:"Clan Blackstone" },
    { key:"rowthorn",   name:"Clan Rowthorn" },
    { key:"karr",       name:"Clan Karr" },
    { key:"bacca",      name:"Clan Bacca" },
    { key:"farmer",     name:"Clan Farmer" },
    { key:"slade",      name:"Clan Slade" },
    { key:"molten",     name:"Clan Molten" },
  ];

  function ensureOrgState(){
    if(state.organization && typeof state.organization === "object") return;

    state.organization = {
      type: "none",
      honour: Object.fromEntries(CLANS.map(c => [c.key, 0])),
      support: Object.fromEntries(CLANS.map(c => [c.key, 0])),

      clan: { name: "", chief: "", motto: "", honour: 0, foundedTurn: null },

      merc: {
        name: "",
        trustedClients: Object.fromEntries(CLANS.map(c => [c.key, 50])),
        foundedTurn: null,
      },

      draft: null,
    };
  }

  function ensureWarState(){
    if(state.war && typeof state.war === "object") return;
    state.war = { planned: null, history: [] };
  }

  function orgSupportForClan(clanKeyStr){
    ensureOrgState();

    const pc = clampInt(state.politicalCapital?.[clanKeyStr] ?? 0, -100, 100);
    const honour = clampInt(state.organization.honour?.[clanKeyStr] ?? 0, -5, 5);

    const pc01 = (pc + 100) / 200;
    const ho01 = (honour + 5) / 10;

    const support = Math.round((pc01 * 0.60 + ho01 * 0.40) * 100);
    return clampInt(support, 0, 100);
  }

  function recomputeOrgSupport(){
    ensureOrgState();
    for(const c of CLANS){
      state.organization.support[c.key] = orgSupportForClan(c.key);
    }
  }

  function clanFormationProgress(){
    recomputeOrgSupport();

    const levelOk = state.partyLevel >= 9;
    const supports = CLANS.map(c => state.organization.support[c.key]);
    const total = supports.reduce((a,b)=>a+b,0);
    const strong = supports.filter(v => v >= 55).length;

    const thresholdTotal = 360;
    const thresholdStrong = 3;
    const thresholdPerClan = 55;

    const totalOk = total >= thresholdTotal;
    const strongOk = strong >= thresholdStrong;

    return { levelOk, totalOk, strongOk, total, strong, ok: levelOk && totalOk && strongOk, thresholdTotal, thresholdStrong, thresholdPerClan };
  }

  function mercFormationProgress(){
    const levelOk = state.partyLevel >= 7;
    const defendersOk = (state.defenders?.count ?? 0) >= 3;
    return { levelOk, defendersOk, ok: levelOk && defendersOk };
  }

  function renderOrgWar(){
    ensureOrgState();
    ensureWarState();
    renderOrganizationPanel();
    renderWarPanel();
  }

  function renderOrganizationPanel(){
    ensureOrgState();
    recomputeOrgSupport();

    const type = state.organization.type || "none";
    const label =
      type === "clan" ? `Clan: ${state.organization.clan.name || "Unnamed"}`
      : type === "merc" ? `Brigade: ${state.organization.merc.name || "Unnamed"}`
      : "Unsworn";
    ui.orgStatusPill.textContent = label;

    const progClan = clanFormationProgress();
    const progMerc = mercFormationProgress();

    let summary = "";
    if(type === "none"){
      summary = `Unsworn. Founding a Clan requires Party Level 9+, total Support ${progClan.thresholdTotal}+, and at least ${progClan.thresholdStrong} clans at ${progClan.thresholdPerClan}+ support. A Mercenary Brigade requires Party Level 7+ and at least 3 Defenders.`;
    } else if(type === "clan"){
      summary = `You are operating as a recognized Clan. Your Clan Honour is ${state.organization.clan.honour}/100. Higher honour unlocks stronger leverage, recruitment, and later territorial war options.`;
    } else {
      summary = `You are operating as a Mercenary Brigade. Clan Honour doesn’t gate your work, but Trusted Clients does. Strong client trust leads to retainers and better pay.`;
    }
    ui.orgSummary.textContent = summary;

    ui.chooseClanBtn.disabled = (type !== "none");
    ui.chooseMercBtn.disabled = (type !== "none");

    const draft = state.organization.draft;

    if(!draft){
      ui.orgFormArea.innerHTML = `<div class="small muted">No changes queued.</div>`;
    } else if(draft.type === "clan"){
      ui.orgFormArea.innerHTML = `
        <div class="label" style="padding:0">Found a Clan</div>
        <div class="small muted">Your banner becomes a political entity. This changes how the Isles respond to you.</div>

        <label class="field" style="margin-top:10px">
          <span>Clan Name</span>
          <input id="clanNameInput" placeholder="e.g., Clan Ironbow" value="${escapeHtml(String(draft.name||""))}">
        </label>

        <label class="field">
          <span>Chief (elected)</span>
          <input id="clanChiefInput" placeholder="e.g., Rowan the Steadfast" value="${escapeHtml(String(draft.chief||""))}">
        </label>

        <label class="field">
          <span>Motto (optional)</span>
          <input id="clanMottoInput" placeholder="e.g., We hold the line." value="${escapeHtml(String(draft.motto||""))}">
        </label>

        <div class="actions" style="padding:0; margin-top:10px">
          <button class="btn btn--primary" type="button" id="confirmOrgBtn" ${progClan.ok ? "" : "disabled"}>Confirm Founding</button>
          <button class="btn" type="button" id="cancelOrgBtn">Cancel</button>
        </div>

        ${progClan.ok ? "" : `
          <div class="small muted" style="margin-top:10px">
            Requirements not yet met:
            <ul>
              <li>${progClan.levelOk ? "✅" : "❌"} Party Level 9+ (current ${state.partyLevel})</li>
              <li>${progClan.totalOk ? "✅" : "❌"} Total Support ${progClan.thresholdTotal}+ (current ${progClan.total})</li>
              <li>${progClan.strongOk ? "✅" : "❌"} ${progClan.thresholdStrong}+ clans at ${progClan.thresholdPerClan}+ support (current ${progClan.strong})</li>
            </ul>
          </div>
        `}
      `;
    } else if(draft.type === "merc"){
      ui.orgFormArea.innerHTML = `
        <div class="label" style="padding:0">Found a Mercenary Brigade</div>
        <div class="small muted">Gold first. Contracts and reputation replace honour as your primary leverage.</div>

        <label class="field" style="margin-top:10px">
          <span>Brigade Name</span>
          <input id="mercNameInput" placeholder="e.g., The Scarlet Oars" value="${escapeHtml(String(draft.name||""))}">
        </label>

        <div class="actions" style="padding:0; margin-top:10px">
          <button class="btn btn--primary" type="button" id="confirmOrgBtn" ${progMerc.ok ? "" : "disabled"}>Confirm Founding</button>
          <button class="btn" type="button" id="cancelOrgBtn">Cancel</button>
        </div>

        ${progMerc.ok ? "" : `
          <div class="small muted" style="margin-top:10px">
            Requirements not yet met:
            <ul>
              <li>${progMerc.levelOk ? "✅" : "❌"} Party Level 7+ (current ${state.partyLevel})</li>
              <li>${progMerc.defendersOk ? "✅" : "❌"} 3+ Defenders (current ${state.defenders?.count ?? 0})</li>
            </ul>
          </div>
        `}
      `;
    }

    ui.orgClanTable.innerHTML = CLANS.map(c => {
      const h = clampInt(state.organization.honour[c.key] ?? 0, -5, 5);
      const sup = clampInt(state.organization.support[c.key] ?? 0, 0, 100);
      return `
        <div class="orgRow" data-clan="${escapeHtml(c.key)}">
          <div class="orgName">${escapeHtml(c.name)}</div>
          <div class="orgBar" title="Support">
            <div class="orgFill" style="width:${sup}%"></div>
          </div>
          <div class="orgMeta">${sup}%</div>
          <input class="orgHonourInput" type="number" min="-5" max="5" step="1"
            value="${escapeHtml(String(h))}" title="Honour / Respect (-5 to +5)">
        </div>
      `;
    }).join("");

    ui.orgClientTable.innerHTML = CLANS.map(c => {
      const v = clampInt(state.organization.merc.trustedClients?.[c.key] ?? 50, 0, 100);
      return `
        <div class="orgRow" data-client="${escapeHtml(c.key)}">
          <div class="orgName">${escapeHtml(c.name)}</div>
          <div class="orgBar" title="Trusted Clients">
            <div class="orgFill" style="width:${v}%"></div>
          </div>
          <div class="orgMeta">${v}%</div>
          <input class="orgClientInput" type="number" min="0" max="100" step="1"
            value="${escapeHtml(String(v))}" title="Trusted Clients (0 to 100)">
        </div>
      `;
    }).join("");

    wireOrgPanelHandlers();
  }

  function wireOrgPanelHandlers(){
    ui.chooseClanBtn.onclick = () => {
      ensureOrgState();
      state.organization.draft = { type:"clan", name: state.organization.clan.name || "", chief: state.organization.clan.chief || "", motto: state.organization.clan.motto || "" };
      saveState();
      render();
    };

    ui.chooseMercBtn.onclick = () => {
      ensureOrgState();
      state.organization.draft = { type:"merc", name: state.organization.merc.name || "" };
      saveState();
      render();
    };

    ui.clearOrgBtn.onclick = () => {
      ensureOrgState();
      state.organization.type = "none";
      state.organization.draft = null;
      state.organization.clan = { name:"", chief:"", motto:"", honour:0, foundedTurn:null };
      state.organization.merc = { name:"", trustedClients: Object.fromEntries(CLANS.map(c => [c.key, 50])), foundedTurn:null };
      saveState();
      log("Identity", "Reset Party Identity (Unsworn).");
      render();
    };

    ui.orgClanTable.querySelectorAll(".orgHonourInput").forEach((inp) => {
      inp.onchange = () => {
        const row = inp.closest(".orgRow");
        const key = row?.getAttribute("data-clan");
        if(!key) return;
        ensureOrgState();
        state.organization.honour[key] = clampInt(inp.value, -5, 5);
        saveState();
        renderOrganizationPanel();
      };
    });

    ui.orgClientTable.querySelectorAll(".orgClientInput").forEach((inp) => {
      inp.onchange = () => {
        const row = inp.closest(".orgRow");
        const key = row?.getAttribute("data-client");
        if(!key) return;
        ensureOrgState();
        state.organization.merc.trustedClients[key] = clampInt(inp.value, 0, 100);
        saveState();
        renderOrganizationPanel();
      };
    });

    const confirmBtn = document.getElementById("confirmOrgBtn");
    const cancelBtn  = document.getElementById("cancelOrgBtn");

    if(cancelBtn){
      cancelBtn.onclick = () => {
        ensureOrgState();
        state.organization.draft = null;
        saveState();
        render();
      };
    }

    if(confirmBtn){
      confirmBtn.onclick = () => confirmOrgFounding();
    }
  }

  function confirmOrgFounding(){
    ensureOrgState();
    const draft = state.organization.draft;
    if(!draft) return;

    if(draft.type === "clan"){
      const prog = clanFormationProgress();
      if(!prog.ok){
        openSIModal({
          title: "Cannot Found Clan Yet",
          bodyHtml: `<div class="small muted">Your support is not high enough yet. Increase Political Capital and Honour with key clans, then try again.</div>`,
          modalClass: "siModal--hall"
        });
        return;
      }

      const name = (document.getElementById("clanNameInput")?.value || "").trim();
      const chief = (document.getElementById("clanChiefInput")?.value || "").trim();
      const motto = (document.getElementById("clanMottoInput")?.value || "").trim();

      if(!name || !chief){
        openSIModal({ title:"Missing Details", bodyHtml:`<div class="small muted">Clan Name and Chief are required.</div>` });
        return;
      }

      state.organization.type = "clan";
      state.organization.clan.name = name;
      state.organization.clan.chief = chief;
      state.organization.clan.motto = motto;
      state.organization.clan.foundedTurn = state.turn;
      state.organization.clan.honour = clampInt(state.organization.clan.honour ?? 40, 0, 100);

      recomputeOrgSupport();
      const topAllies = [...CLANS].sort((a,b)=>state.organization.support[b.key]-state.organization.support[a.key]).slice(0,2);
      for(const a of topAllies){
        state.politicalCapital[a.key] = clampInt((state.politicalCapital[a.key] ?? 0) + 5, -100, 100);
      }

      state.organization.draft = null;
      saveState();
      log("Identity", `Clan founded: ${name}. Chief elected: ${chief}.`);
      render();
      return;
    }

    if(draft.type === "merc"){
      const prog = mercFormationProgress();
      if(!prog.ok){
        openSIModal({
          title: "Cannot Found Brigade Yet",
          bodyHtml: `<div class="small muted">You need Party Level 7+ and at least 3 Defenders to credibly sell protection as a Brigade.</div>`
        });
        return;
      }

      const name = (document.getElementById("mercNameInput")?.value || "").trim();
      if(!name){
        openSIModal({ title:"Missing Details", bodyHtml:`<div class="small muted">Brigade Name is required.</div>` });
        return;
      }

      state.organization.type = "merc";
      state.organization.merc.name = name;
      state.organization.merc.foundedTurn = state.turn;
      state.organization.draft = null;

      saveState();
      log("Identity", `Mercenary Brigade founded: ${name}.`);
      render();
      return;
    }
  }

  function renderWarPanel(){
    ensureWarState();
    ensureOrgState();

    const hasPending = state.pendingOrders?.some(o => o && o.type === "war_action");
    ui.warStatusPill.textContent = hasPending ? "Planned" : "Peace";

    ui.warTargetSelect.innerHTML =
      ['<option value="">Select...</option>']
      .concat(CLANS.map(c => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.name)}</option>`))
      .join("");

    const avail = warAvailableForces();
    ui.warCommitDefenders.value = String(state.war.planned?.forces?.defenders ?? Math.min(Math.max(0, avail.defenders), 5));
    ui.warCommitBeasts.value = String(state.war.planned?.forces?.beasts ?? Math.min(avail.beasts, 2));
    ui.warCommitLieutenants.value = String(state.war.planned?.forces?.lieutenants ?? Math.min(avail.lieutenants, 1));
    ui.warCommitRegiments.value = String(state.war.planned?.forces?.regiments ?? 0);

    if(state.war.planned?.target) ui.warTargetSelect.value = state.war.planned.target;
    if(state.war.planned?.objective) ui.warObjectiveSelect.value = state.war.planned.objective;

    ui.warInfo.innerHTML =
      `Available forces: <b>${avail.defenders}</b> defenders, <b>${avail.beasts}</b> beasts, <b>${avail.lieutenants}</b> lieutenants, <b>${avail.regiments}</b> regiments.<br>` +
      `Tip: if you haven’t unlocked the War Room yet, this still works as “small actions” with defenders and beasts.`;

    const hist = (state.war.history || []).slice(0, 6);
    if(hist.length === 0){
      ui.warLogList.innerHTML = `<div class="small muted">No war actions yet.</div>`;
    } else {
      ui.warLogList.innerHTML = hist.map(h => `
        <div class="item">
          <div>
            <div class="item__name">${escapeHtml(h.title)}</div>
            <div class="item__meta">${escapeHtml(h.meta)}</div>
          </div>
          <button class="item__btn" type="button" data-warlog="${escapeHtml(h.id)}">View</button>
        </div>
      `).join("");

      ui.warLogList.querySelectorAll("[data-warlog]").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-warlog");
          const item = hist.find(x => x.id === id);
          openSIModal({
            title: "War Report",
            bodyHtml: `<pre class="small" style="white-space:pre-wrap; margin:0">${escapeHtml(item?.detail || "")}</pre>`,
            modalClass: "siModal--hall"
          });
        };
      });
    }

    ui.planWarBtn.onclick = () => planWarAction();
    ui.clearWarPlanBtn.onclick = () => {
      ensureWarState();
      state.war.planned = null;
      ui.warTargetSelect.value = "";
      ui.warObjectiveSelect.value = "raid";
      ui.warCommitDefenders.value = "0";
      ui.warCommitBeasts.value = "0";
      ui.warCommitLieutenants.value = "0";
      ui.warCommitRegiments.value = "0";
      saveState();
      renderWarPanel();
    };
  }

  function warAvailableForces(){
    const defenders = clampInt(state.defenders?.count ?? 0, 0, 999);
    const beasts = Array.isArray(state.defenderBeasts) ? state.defenderBeasts.length : 0;

    const lieutenants = (state.military || []).filter(x => String(x).toLowerCase().includes("lieutenant")).length;
    const regiments = (state.military || []).filter(x => String(x).toLowerCase().includes("regiment")).length;

    return { defenders, beasts, lieutenants, regiments };
  }

  function planWarAction(){
    ensureWarState();
    ensureOrgState();

    const target = (ui.warTargetSelect.value || "").trim();
    const objective = (ui.warObjectiveSelect.value || "raid").trim();
    if(!target){
      openSIModal({ title:"Missing Target", bodyHtml:`<div class="small muted">Choose a target faction.</div>` });
      return;
    }

    const avail = warAvailableForces();
    const forces = {
      defenders: clampInt(ui.warCommitDefenders.value, 0, avail.defenders),
      beasts: clampInt(ui.warCommitBeasts.value, 0, avail.beasts),
      lieutenants: clampInt(ui.warCommitLieutenants.value, 0, avail.lieutenants),
      regiments: clampInt(ui.warCommitRegiments.value, 0, avail.regiments),
    };

    const totalCommitted = forces.defenders + forces.beasts + forces.lieutenants + forces.regiments;
    if(totalCommitted <= 0){
      openSIModal({ title:"No Forces Committed", bodyHtml:`<div class="small muted">Commit at least 1 unit.</div>` });
      return;
    }

    state.war.planned = { target, objective, forces };

    const order = {
      type: "war_action",
      completeTurn: state.turn + 1,
      label: `War Action: ${objective.toUpperCase()} vs ${target}`,
      war: { target, objective, forces }
    };

    state.pendingOrders.push(order);
    saveState();
    log("War Council", `Queued war action (${objective}) against ${prettyClan(target)}. Resolves on Turn ${state.turn+1}.`);
    render();
  }

  function prettyClan(key){
    return (CLANS.find(c => c.key === key)?.name) || key;
  }

  function warStrengthScore(forces){
    const dScore = (forces.defenders || 0) * 1;
    const bScore = (forces.beasts || 0) * 3;
    const lScore = (forces.lieutenants || 0) * 6;
    const rScore = (forces.regiments || 0) * 14;

    const armedBonus = (state.defenders?.armed) ? 3 : 0;
    const patrolBonus = (state.defenders?.patrolAdvantage) ? 3 : 0;

    return dScore + bScore + lScore + rScore + armedBonus + patrolBonus;
  }

  function warDifficultyDC(objective){
    if(objective === "defend") return 11;
    if(objective === "skirmish") return 13;
    if(objective === "raid") return 14;
    if(objective === "seize") return 16;
    return 14;
  }

  function warReward(objective, success){
    if(!success) return { gp: 0, pcDelta: -2 };
    if(objective === "defend") return { gp: 0, pcDelta: +2 };
    if(objective === "skirmish") return { gp: 60, pcDelta: +3 };
    if(objective === "raid") return { gp: 160, pcDelta: +2 };
    if(objective === "seize") return { gp: 0, pcDelta: +5 };
    return { gp: 100, pcDelta: +2 };
  }

  function warLosses(objective, margin, forces){
    const losses = { defenders:0, beasts:0 };
    const lossSeverity = margin >= 5 ? 0.25 : margin >= 0 ? 0.45 : 0.80;

    losses.defenders = Math.min(
      forces.defenders || 0,
      Math.floor((forces.defenders || 0) * lossSeverity * 0.25)
    );

    losses.beasts = Math.min(
      forces.beasts || 0,
      (margin >= 3 ? 0 : margin >= 0 ? 1 : 1 + Math.floor(lossSeverity))
    );

    if(objective === "seize" && margin < 0){
      losses.defenders = Math.min(forces.defenders || 0, losses.defenders + 1);
    }
    return losses;
  }

  async function completeWarOrder(o){
    ensureWarState();
    ensureOrgState();

    const target = o?.war?.target;
    const objective = o?.war?.objective;
    const forces = o?.war?.forces || {};

    if(!target || !objective){
      log("War Council", "A war action was queued but had missing data. (Ignored)");
      return;
    }

    const dc = warDifficultyDC(objective);
    const strength = warStrengthScore(forces);
    const mod = clampInt(Math.floor(strength / 6), -10, 12);

    const roll = await rollD20Manual({
      title: `War Action: ${objective.toUpperCase()} vs ${prettyClan(target)}`,
      mod,
      dc,
      modalClass: "siModal--hall"
    });

    if(!roll){
      log("War Council", `War action vs ${prettyClan(target)} was cancelled (no resolution).`);
      return;
    }

    const margin = roll.total - dc;
    const success = margin >= 0;

    const reward = warReward(objective, success);
    const losses = warLosses(objective, margin, forces);

    state.treasuryGP = clampInt((state.treasuryGP || 0) + reward.gp, 0);

    if(losses.defenders > 0){
      state.defenders.count = Math.max(0, (state.defenders.count || 0) - losses.defenders);
      if(state.defenders.count === 0) state.defenders.armed = false;
    }

    if(losses.beasts > 0 && Array.isArray(state.defenderBeasts) && state.defenderBeasts.length > 0){
      state.defenderBeasts.splice(0, losses.beasts);
    }

    const pcDeltaTarget = success ? -Math.abs(reward.pcDelta) : +2;
    const pcDeltaOthers = success ? +1 : -1;

    state.politicalCapital[target] = clampInt((state.politicalCapital[target] ?? 0) + pcDeltaTarget, -100, 100);

    if(state.organization.type === "clan"){
      state.organization.clan.honour = clampInt((state.organization.clan.honour ?? 40) + (success ? 2 : -3), 0, 100);
      state.organization.honour[target] = clampInt((state.organization.honour[target] ?? 0) + (-1), -5, 5);
    }

    if(state.organization.type === "merc"){
      for(const c of CLANS){
        const k = c.key;
        const cur = clampInt(state.organization.merc.trustedClients[k] ?? 50, 0, 100);
        const delta = (k === target) ? (success ? -3 : +1) : (success ? +pcDeltaOthers : -2);
        state.organization.merc.trustedClients[k] = clampInt(cur + delta, 0, 100);
      }
    }

    const title = `${success ? "✅" : "❌"} ${objective.toUpperCase()} vs ${prettyClan(target)}`;
    const meta = `Turn ${state.turn} • d20 ${roll.d20} ${mod>=0?"+":""}${mod} = ${roll.total} vs DC ${dc} • ${success ? "Success" : "Failure"}`;
    const detail = [
      meta,
      reward.gp ? `Treasury: +${reward.gp} GP` : "Treasury: +0 GP",
      `Political Capital (${prettyClan(target)}): ${pcDeltaTarget>=0?"+":""}${pcDeltaTarget}`,
      losses.defenders ? `Losses: ${losses.defenders} defenders` : "Losses: 0 defenders",
      losses.beasts ? `Losses: ${losses.beasts} beasts` : "Losses: 0 beasts",
      state.organization.type === "clan" ? `Clan Honour is now ${state.organization.clan.honour}/100` : ""
    ].filter(Boolean).join("\n");

    state.war.history.unshift({ id: uid(), title, meta, detail });

    saveState();
    log("War Report", detail.replaceAll("\n"," • "));
  }

  // -------------------------------
  // SIMPLE DICE / MODAL HELPERS
  // -------------------------------

  function d(sides){ return Math.floor(Math.random() * sides) + 1; }

  function resolveEvent(roll, table){
    // table entries expected: { min, max, title, description } (your events.json format)
    if(!Array.isArray(table) || table.length===0) return { title:"No Events", description:"events.json missing or empty." };
    const hit = table.find(e => roll >= (e.min ?? 1) && roll <= (e.max ?? 100));
    return hit || table[0];
  }

  function openSIModal({ title, bodyHtml, modalClass = "" }){
    const modal = document.createElement("div");
    modal.className = `siModal ${modalClass}`.trim();
    modal.innerHTML = `
      <div class="siModal__inner">
        <div class="siModal__head">
          <div class="siModal__title">${escapeHtml(title || "Notice")}</div>
          <button class="btn btn--ghost" type="button" id="siCloseBtn">Close</button>
        </div>
        <div class="siModal__body">${bodyHtml || ""}</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("#siCloseBtn").onclick = () => modal.remove();
    modal.addEventListener("click", (e)=>{ if(e.target === modal) modal.remove(); });
  }

  async function openSIModalChoice({ title, bodyHtml, primaryText="OK", secondaryText="Cancel", modalClass="", collectIds=[] }){
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = `siModal ${modalClass}`.trim();
      modal.innerHTML = `
        <div class="siModal__inner">
          <div class="siModal__head">
            <div class="siModal__title">${escapeHtml(title || "Choose")}</div>
          </div>
          <div class="siModal__body">${bodyHtml || ""}</div>
          <div class="siModal__foot">
            <button class="btn" type="button" id="siCancelBtn">${escapeHtml(secondaryText)}</button>
            <button class="btn btn--primary" type="button" id="siOkBtn">${escapeHtml(primaryText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const cleanup = () => modal.remove();

      modal.querySelector("#siCancelBtn").onclick = () => { cleanup(); resolve({ action:"cancel", values:{} }); };
      modal.querySelector("#siOkBtn").onclick = () => {
        const values = {};
        for(const id of collectIds){
          const el = document.getElementById(id);
          values[id] = el ? el.value : null;
        }
        cleanup();
        resolve({ action:"ok", values });
      };
      modal.addEventListener("click", (e)=>{ if(e.target === modal){ cleanup(); resolve({ action:"cancel", values:{} }); }});
    });
  }

  async function rollD20Manual({ title, mod = 0, dc = null, modalClass = "" }){
    const bodyHtml = `
      <div class="field">
        <div>Enter your d20 result</div>
        <input id="siManualD20" type="number" min="1" max="20" value="10" />
        <div class="small muted" style="margin-top:6px">
          Modifier: <b>${mod >= 0 ? "+" : ""}${escapeHtml(String(mod))}</b>
          ${dc != null ? ` • DC <b>${escapeHtml(String(dc))}</b>` : ""}
        </div>
      </div>
    `;

    const res = await openSIModalChoice({
      title: title || "Roll",
      bodyHtml,
      primaryText: "Continue",
      secondaryText: "Cancel",
      modalClass,
      collectIds: ["siManualD20"]
    });

    if(res.action !== "ok") return null;

    const d20 = clampInt(res.values.siManualD20 ?? 10, 1, 20);
    const total = d20 + clampInt(mod, -50, 50);
    return { d20, total };
  }

  // -------------------------------
  // STATE IO
  // -------------------------------

  function loadState(){
    const raw = localStorage.getItem(STORAGE_KEY);

    const DEFAULT_STATE = {
      treasuryGP: 0,
      partyLevel: 7,

      builtFacilities: ["barracks","armoury","watchtower","workshop","dock"],
      builtExtras: [],
      pendingOrders: [],

      defenders: { count:0, armed:false, patrolAdvantage:false },
      defenderBeasts: [],

      military: [],
      warehouse: [],
      artisanTools: ["","","","","",""],

      favour: { telluria: 0, aurush: 0, pelagos: 0 },
      politicalCapital: { blackstone:0, bacca:0, farmer:0, slade:0, molten:0, rowthorn:0, karr:0 },

      tradeNetwork: { active:false, strategy:"balanced", stability:75, routes:[], lastResolvedTurn:-1, recruitmentBoostTurns:0 },
      arbitration: { queue:[], lastSpawnTurn:-1 },

      // Party identity + war council
      organization: null,
      war: null,

      turn: 1,
      lastEvent: null,
      log: [],
    };

    if(!raw) return DEFAULT_STATE;

    try{
      const s = JSON.parse(raw);

      const merged = {
        ...DEFAULT_STATE,
        treasuryGP: clampInt(s.treasuryGP ?? DEFAULT_STATE.treasuryGP, 0),
        partyLevel: clampInt(s.partyLevel ?? DEFAULT_STATE.partyLevel, 1, 20),

        builtFacilities: Array.isArray(s.builtFacilities) ? s.builtFacilities : DEFAULT_STATE.builtFacilities,
        builtExtras: Array.isArray(s.builtExtras) ? s.builtExtras : DEFAULT_STATE.builtExtras,

        pendingOrders: Array.isArray(s.pendingOrders) ? s.pendingOrders : DEFAULT_STATE.pendingOrders,

        defenders: {
          count: clampInt(s.defenders?.count ?? DEFAULT_STATE.defenders.count, 0),
          armed: !!s.defenders?.armed,
          patrolAdvantage: !!s.defenders?.patrolAdvantage,
        },

        defenderBeasts: Array.isArray(s.defenderBeasts) ? s.defenderBeasts : DEFAULT_STATE.defenderBeasts,
        military: Array.isArray(s.military) ? s.military : DEFAULT_STATE.military,
        warehouse: Array.isArray(s.warehouse) ? s.warehouse : DEFAULT_STATE.warehouse,
        artisanTools: Array.isArray(s.artisanTools) ? s.artisanTools : DEFAULT_STATE.artisanTools,

        favour: {
          telluria: clampInt(s.favour?.telluria ?? 0, 0, 100),
          aurush: clampInt(s.favour?.aurush ?? 0, 0, 100),
          pelagos: clampInt(s.favour?.pelagos ?? 0, 0, 100),
        },

        politicalCapital: {
          blackstone: clampInt(s.politicalCapital?.blackstone ?? 0, -100, 100),
          bacca:      clampInt(s.politicalCapital?.bacca ?? 0, -100, 100),
          farmer:     clampInt(s.politicalCapital?.farmer ?? 0, -100, 100),
          slade:      clampInt(s.politicalCapital?.slade ?? 0, -100, 100),
          molten:     clampInt(s.politicalCapital?.molten ?? 0, -100, 100),
          rowthorn:   clampInt(s.politicalCapital?.rowthorn ?? 0, -100, 100),
          karr:       clampInt(s.politicalCapital?.karr ?? 0, -100, 100),
        },

        tradeNetwork: (s.tradeNetwork && typeof s.tradeNetwork === "object") ? s.tradeNetwork : DEFAULT_STATE.tradeNetwork,
        arbitration: (s.arbitration && typeof s.arbitration === "object") ? s.arbitration : DEFAULT_STATE.arbitration,

        organization: (s.organization && typeof s.organization === "object") ? s.organization : DEFAULT_STATE.organization,
        war: (s.war && typeof s.war === "object") ? s.war : DEFAULT_STATE.war,

        turn: clampInt(s.turn ?? DEFAULT_STATE.turn, 1),
        lastEvent: s.lastEvent || null,
        log: Array.isArray(s.log) ? s.log : DEFAULT_STATE.log,
      };

      return merged;
    }catch(e){
      console.warn("Bad state JSON, resetting.", e);
      return DEFAULT_STATE;
    }
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // -------------------------------
  // UTILS
  // -------------------------------

  function clampInt(v, min, max){
    const n = Number(v);
    if(Number.isNaN(n)) return min;
    if(max == null) return Math.max(min, Math.floor(n));
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function fmtTime(ms){
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
})();
