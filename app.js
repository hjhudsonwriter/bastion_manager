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
 
  };

  let DATA = { facilities: [], tools: {}, events: null };

   // --- Construction timing rules ---
function buildTurnsForRequiredLevel(requiredLevel){
  const rl = Number(requiredLevel || 0);
  if(rl >= 17) return 5;
  if(rl >= 13) return 5;
  if(rl >= 9)  return 4;
  if(rl >= 5)  return 3;
  return 0; // starter / no-threshold
}

// Your 5 always-built facilities
const STARTING_BUILT = ["barracks","armoury","watchtower","workshop","dock"];

// Normalize old saves: strings -> {status:"built"}
function normalizeBuiltExtras(){
  if(!Array.isArray(state.builtExtras)) state.builtExtras = [];
  state.builtExtras = state.builtExtras.map(x=>{
    if(!x) return "";
    if(typeof x === "string") return { facId: x, status: "built" };
    if(typeof x === "object" && x.facId) return x;
    return "";
  });
}

// Facilities "reserved" (built OR building) so you can't pick duplicates
function reservedFacilityIds(){
  normalizeBuiltExtras();
  const extra = state.builtExtras
    .filter(x => x && typeof x === "object" && x.facId)
    .map(x => x.facId);
  return Array.from(new Set([...STARTING_BUILT, ...extra]));
}

// Facilities that are actually ACTIVE (built only)
function builtFacilityIds(){
  normalizeBuiltExtras();
  const extraBuilt = state.builtExtras
    .filter(x => x && typeof x === "object" && x.status === "built" && x.facId)
    .map(x => x.facId);
  return Array.from(new Set([...STARTING_BUILT, ...extraBuilt]));
}

// Advance construction by 1 turn
function tickConstruction(){
  normalizeBuiltExtras();
  let completed = [];

  state.builtExtras = state.builtExtras.map(entry=>{
    if(!entry || entry === "") return "";

    if(entry.status === "building"){
      const next = Math.max(0, Number(entry.remaining || 0) - 1);
      if(next === 0){
        completed.push(entry.facId);
        return { facId: entry.facId, status: "built" };
      }
      return { ...entry, remaining: next };
    }

    return entry; // built
  });

  // Log completions
  for(const id of completed){
    const fac = DATA.facilities.find(f=>f.id===id);
    log("Construction Complete", `${fac ? fac.name : id} is now built and active.`);
  }
}

   const FACILITY_IMG = {
  // Starting facilities
  barracks: "barracks.png",
  armoury: "armoury.png",
  watchtower: "watchtower.png",
  workshop: "workshop.png",
  dock: "docks.png",

  // Buildable facilities
  arcane_study: "arcane_study.png",
  library: "library.png",
  smithy: "smithy.png",
  garden: "garden.png",
  menagerie: "menagerie.png",
  scriptorium: "scriptorium.png",

  // Your two missing ones (THIS is the fix)
  laboratory: "laboratory.png",
  war_room: "war_room.png",

  // The rest
  gaming_hall: "gambling_hall.png",
  storehouse: "storehouse.png",
  greenhouse: "greenhouse.png",
  guildhall: "guildhall.png",
  shrine_telluria: "shrine_of_telluria.png",
  shrine_aurush: "shrine_of_aurush.png",
  shrine_pelagos: "shrine_of_pelagos.png",
  hall_of_emissaries: "hall_of_emissaries.png",
};

  init().catch(err => {
  console.error(err);
  alert("App error during init. Open DevTools Console (F12) and check the error details.");
});


  async function init(){
    // Populate level selector 1-20
    ui.levelSelect.innerHTML = Array.from({length:20}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join("");

    // Load data
    const [facilities, tools, events] = await Promise.all([
      fetch(withBase("data/facilities.json")).then(r=>r.json()),
      fetch(withBase("data/tools_tables.json")).then(r=>r.json()),
      fetch(withBase("data/events.json")).then(r=>r.json()),
    ]);
    DATA = { facilities, tools, events };
     ensureDiplomacyState();
     ensureDiplomacyPanel();

    // Wire controls
    ui.treasuryInput.value = String(state.treasuryGP);
    ui.levelSelect.value = String(state.partyLevel);

    ui.treasuryInput.addEventListener("input", () => {
      state.treasuryGP = clampInt(ui.treasuryInput.value, 0);
      saveState();
      render();
    });

    ui.levelSelect.addEventListener("change", () => {
      state.partyLevel = clampInt(ui.levelSelect.value, 1);
      saveState();
      render();
    });

     ui.clearBuildBtn?.addEventListener("click", () => {
  if(!confirm("Clear all extra built facilities (slots) only? Your 5 starting facilities remain.")) return;
  state.builtExtras = [];
  saveState();
  log("Facilities", "Cleared extra built facilities.");
  render();
});

   ui.saveArtisanToolsBtn?.addEventListener("click", ()=>{
  readArtisanToolsFromUI();
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
    state.warehouse = [];
    saveState();
    log("Warehouse", "Cleared warehouse.");
    renderWarehouse();
    renderLog();
  });
}

    ui.clearLogBtn.addEventListener("click", () => {
      state.log = [];
      saveState();
      render();
    });

    ui.rollEventBtn?.addEventListener("click", () => {
      const roll = d(100);
      const ev = resolveEvent(roll, DATA.events.eventTable);
      const descLines = (DATA.events.descriptions && DATA.events.descriptions[ev.name]) ? DATA.events.descriptions[ev.name] : [];
      state.lastEvent = { roll, name: ev.name, lines: descLines, at: Date.now() };
      saveState();
      log("Bastion Event", `Rolled ${roll} → ${ev.name}`);
      render();
    });

    ui.advanceTurnBtn.addEventListener("click", async () => {
  state.turn += 1;
       
         tickDiplomacyOnAdvanceTurn(); // ✅ add this line
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
  const ev = resolveEvent(roll, DATA.events.eventTable);
  const descLines = (DATA.events.descriptions && DATA.events.descriptions[ev.name]) ? DATA.events.descriptions[ev.name] : [];
  state.lastEvent = { roll, name: ev.name, lines: descLines, at: Date.now() };
  log("Bastion Event", `Auto event (Turn ${state.turn}) → Rolled ${roll} → ${ev.name}`);
}

       saveState();
  log("Turn Advanced", `Bastion Turn is now ${state.turn}.`);
  render();
});

    // ---------------- Save Export / Import ----------------
ui.downloadSaveBtn?.addEventListener("click", () => {
  try{
    // Make sure latest UI edits are captured before export
    readWarehouseFromUI?.();
    readArtisanToolsFromUI?.();

    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ironbow_bastion_save_turn_${state.turn}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
    log("Save File", "Downloaded JSON save file.");
    saveState();
    render();
  }catch(e){
    console.error(e);
    alert("Could not download save. Open Console (F12) for details.");
  }
});

ui.importSaveBtn?.addEventListener("click", () => {
  ui.importFileInput?.click();
});

ui.importFileInput?.addEventListener("change", async () => {
  const file = ui.importFileInput.files?.[0];
  if(!file) return;

  try{
    const text = await file.text();
    const imported = JSON.parse(text);

    if(!confirm("Import this save? This will overwrite your current saved state in this browser.")){
      ui.importFileInput.value = "";
      return;
    }

    // Store imported JSON directly; your loadState() already merges defaults safely on reload
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    location.reload();
  }catch(e){
    console.error(e);
    alert("That file was not valid JSON (or couldn’t be read). Open Console (F12) for details.");
  }finally{
    ui.importFileInput.value = "";
  }
});

     ui.resetBtn.addEventListener("click", () => {
      if(!confirm("Reset app state? This clears your local saved data on THIS browser only.")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    render();
    bindFavourButtonsOnce();
    renderFavour();
    bindPoliticalButtonsOnce();
    renderPoliticalCapital();
  }

   async function completeOrderAsync(o){
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
    await completeOrder(o); // completeOrder now contains awaits for this branch
    return;
  }

  // Everything else stays synchronous and untouched
  completeOrder(o);
}

   async function completeOrder(o){
  const fac = DATA.facilities.find(f => f.id === o.facId);
  if(!fac) return;
  const fn = (fac.functions || []).find(x => x.id === o.fnId);
  if(!fn) return;

  const label = o.label || `${fac.name}: ${fn.label}`;
  const optionLabel = o.optionLabel || null;
  const chosen = o.chosen || null;
    // --- Shrines: special prayer effects (on completion) ---
  const special = chosen && chosen.special ? chosen.special : null;
  if(special && special.type){
    const god = String(special.god || "").toLowerCase();

    if(special.type === "favour_blessing"){
      const roll = d(20); // 1d20
      addFavourPercent(god, roll);
      log("Order Completed", `${label} → Rolled 1d20 = ${roll}. Added +${roll}% to ${god.toUpperCase()} favour.`);
      return;
    }

    if(special.type === "oracle_hint"){
      const roll = d(10); // 1d10
      const hit = (roll >= 4 && roll <= 7);
      log("Order Completed", `${label} → Rolled 1d10 = ${roll}. ${hit ? "A hint is granted (DM decides the hint)." : "No hint this time."}`);
      return;
    }

    if(special.type === "blessing_rest"){
      const roll = d(6); // 1d6
      const hit = (roll >= 5);
      log("Order Completed", `${label} → Rolled 1d6 = ${roll}. ${hit ? "Long Rest effects granted." : "No rest granted."}`);
      return;
    }
  }    

  // Barracks recruit defenders
  if(fac.id==="barracks" && fn.id==="recruit_defenders"){
    const r = d(4);
    state.defenders.count += r;
    log("Order Completed", `${label} → Recruited ${r} defenders.`);
    return;
  }

  // Watchtower patrol buff (applies for the new turn)
  if(fac.id==="watchtower" && fn.id==="patrol"){
    state.defenders.patrolAdvantage = true;
    log("Order Completed", `${label} → Patrol active this turn.`);
    return;
  }

  // Armoury arm defenders
  if(fac.id==="armoury" && fn.id==="arm_defenders"){
    state.defenders.armed = (state.defenders.count > 0);
    log("Order Completed", `${label} → Defenders armed.`);
    return;
  }

  // War Room recruit → military
  if(fac.id==="war_room" && fn.id==="recruit"){
    const unit = optionLabel || "Unit";
    addToList(state.military, unit, { source: "War Room" });
    log("Order Completed", `${label} → Recruited: ${unit}.`);
    return;
  }

  // Menagerie recruit beast → military (or defenders later)
  if(fac.id==="menagerie" && fn.id==="recruit_beast"){
  const beast = optionLabel || "Beast";
  addToList(state.defenderBeasts, beast, { source: "Menagerie" });
  log("Order Completed", `${label} → Recruited beast: ${beast}. Added to Bastion Defenders.`);
  return;
}

  // Hall of Emissaries (Dice + Consequences)
  if(fac.id === "hall_of_emissaries" && fn.special && fn.special.type === "emissary_action"){
    ensureDiplomacyState();

    const kind = String(fn.special.kind || "unknown");
    const opt = o.optionLabel || (o.meta && o.meta.targetClan) || "";
    const baseTurns = clampInt(fn.special.durationTurns ?? 2, 1, 20);

    // Base DCs per action kind (tweak any time)
    const DC_BY_KIND = {
      trade_agreement: 14,
      host_delegation: 13,
      summit: 12,
      arbitration: 15,
      consortium: 16
    };
    const dc = DC_BY_KIND[kind] ?? 14;

    // Cooldown gate (consequence system)
    const cdLeft = diplomacyCooldownTurnsLeft(kind);
    if(cdLeft > 0){
      log("Order Completed", `${label} → Blocked (cooldown ${cdLeft} turns remaining).`);
      saveState();
      return;
    }

    const mod = diplomacyModForHall();

    // 1) Dice animation
    const roll = await rollD20Manual({
  title: `${fn.label} (${opt})`,
  mod,
  dc,
  modalClass: "siModal--hall"
});

    const tier = tierFromRoll(roll.d20, roll.total, dc);

    // 2) Apply outcome
    const changes = [];
    let summary = "";

    const addContract = (arrName, rec) => {
      state.diplomacy[arrName].push(rec);
      changes.push(`New record: ${rec.title} (${rec.turnsLeft} turns)`);
      if(rec.incomePerTurn) changes.push(`Income: +${rec.incomePerTurn} gp/turn`);
    };

    const randBetween = (a, b) => {
      const min = clampInt(Math.min(a,b), -999999, 999999);
      const max = clampInt(Math.max(a,b), -999999, 999999);
      return min + Math.floor(Math.random() * (max - min + 1));
    };

    let turnsAdj = 0;
    let incomeMult = 1;

    // Political Capital deltas (per clan) instead of global honour/reputation.
// (You can tweak these numbers any time.)
let pcDelta = 0;

if(tier === "critical_success"){ turnsAdj = 2; incomeMult = 1.35; pcDelta = +25; }
if(tier === "great_success"){    turnsAdj = 1; incomeMult = 1.20; pcDelta = +15; }
if(tier === "success"){          turnsAdj = 0; incomeMult = 1.00; pcDelta = +8;  }
if(tier === "failure"){          turnsAdj = -1; incomeMult = 0.75; pcDelta = -10; }
if(tier === "bad_failure"){      turnsAdj = -2; incomeMult = 0;    pcDelta = -20; setDiplomacyCooldown(kind, 2); changes.push("Cooldown: 2 turns"); }

// Apply political capital to the target clan(s)
if(kind === "summit"){
  // Summit "pair" might be "Blackstone & Rowthorn" etc.
  const parts = String(opt).split("&").map(x => x.trim()).filter(Boolean);
  for(const p of parts) addPoliticalCapital(p, pcDelta);
  if(parts.length){
    changes.push(`Political Capital: ${pcDelta >= 0 ? "+" : ""}${pcDelta} (${parts.join(" & ")})`);
  }
} else {
  addPoliticalCapital(opt, pcDelta);
  changes.push(`Political Capital: ${pcDelta >= 0 ? "+" : ""}${pcDelta} (${String(opt)})`);
}

    const turns = clampInt(baseTurns + turnsAdj, 1, 30);

    // ---- SUMMIT ----
    if(kind === "summit"){
      if(incomeMult === 0){
        summary = `The summit collapses into accusation and slammed goblets. No accord is reached.`;
      } else {
        const basePct = clampInt(fn.special.costReductionPct ?? 0, 0, 90);
        const pct =
          tier === "critical_success" ? clampInt(basePct + 10, 0, 90) :
          tier === "great_success"    ? clampInt(basePct + 5, 0, 90) :
          tier === "failure"          ? clampInt(basePct - 5, 0, 90) :
                                        basePct;

        state.diplomacy.summits.push({
          id: uid(),
          title: "Inter-Clan Summit",
          pair: String(opt),
          turnsLeft: turns,
          costReductionPct: pct
        });

        appendToWarehouse("Summit Charter", 1, "", "Hall of Emissaries");
        changes.push(`Trade action discount: ${pct}% (${turns} turns)`);
        summary = `A charter is inked. Trade routes loosen. The room exhales.`;
      }
    }

    // ---- HOST DELEGATION ----
    else if(kind === "host_delegation"){
  ensureDiplomacyState();

  const tone = String(o?.meta?.tone || "assertive");
  const gMin = clampInt(fn.special.oneTimeTreasuryMin ?? 0, 0);
  const gMax = clampInt(fn.special.oneTimeTreasuryMax ?? gMin, gMin);

  // Tone adjusts risk/reward slightly
  const toneMod =
    tone === "conciliatory" ? +2 :
    tone === "opportunistic" ? -2 :
    0;

  const diplomacyDC = 13;
  const insightDC = 12;

  const modDiplomacy = diplomacyModForHall() + toneMod;
  const modInsight = diplomacyModForHall(); // simple: same base, different DC

  // Two animated rolls
  const r1 = await rollD20Manual({ title: `Diplomacy Roll (${tone})`, mod: modDiplomacy, dc: diplomacyDC, modalClass: "siModal--hall" });
       if(!roll){ log("Order Resolved", `${fn.label} was cancelled at the roll step.`); saveState(); render(); return; }
  const r2 = await rollD20Manual({ title: `Insight Roll (${tone})`, mod: modInsight, dc: insightDC, modalClass: "siModal--hall" });
       if(!roll){ log("Order Resolved", `${fn.label} was cancelled at the roll step.`); saveState(); render(); return; }

  const s1 = r1.total >= diplomacyDC;
  const s2 = r2.total >= insightDC;
  const successes = (s1?1:0) + (s2?1:0);

  // Outcome mapping
  // Strong: 2 successes
  // Normal: 1 success
  // Weak: 0 successes but not terrible (either total within 2 of DC)
  // Fail: 0 successes and clearly bad
  const weak =
    !s1 && !s2 && (r1.total >= diplomacyDC - 2 || r2.total >= insightDC - 2);

  let pcDelta = 0;
  let tokenGain = 0;
  let summary = "";
  let gained = 0;

  if(successes === 2){
    pcDelta = +15;
    tokenGain = 1;
    summary = "The delegation leaves impressed. Promises become leverage.";
  } else if(successes === 1){
    pcDelta = +8;
    summary = "A workable meeting. You earn cautious goodwill.";
  } else if(weak){
    pcDelta = 0;
    summary = "Awkward, but not disastrous. No real shift.";
  } else {
    pcDelta = -12;
    summary = "A diplomatic stumble. Word travels faster than apologies.";
  }

  // Political capital applies to the target clan
  addPoliticalCapital(opt, pcDelta);
  changes.push(`Political Capital: ${pcDelta >= 0 ? "+" : ""}${pcDelta} (${String(opt)})`);

  // Tokens
  if(tokenGain > 0){
    state.diplomacy.tokens = clampInt((state.diplomacy.tokens ?? 0) + tokenGain, 0, 999);
    changes.push(`Favour Token: +${tokenGain}`);
  }

  // Optional gift gold: conciliatory yields smaller gold, opportunistic yields bigger gold (but higher risk already)
  gained = clampInt(randBetween(gMin, gMax), 0, 999999);
  if(tone === "conciliatory") gained = clampInt(Math.floor(gained * 0.85), 0, 999999);
  if(tone === "opportunistic") gained = clampInt(Math.floor(gained * 1.15), 0, 999999);

  // Only pay out gold on non-fail
  if(successes > 0 || weak){
    state.treasuryGP += gained;
    changes.push(`Treasury: +${gained} gp`);
  } else {
    const penalty = clampInt(Math.ceil((gMin + gMax) / 6), 0);
    state.treasuryGP -= penalty;
    changes.push(`Treasury: -${penalty} gp`);
  }

  state.diplomacy.delegations.push({
    id: uid(),
    title: `Hosted Delegation (${tone})`,
    clan: String(opt),
    turnsLeft: turns
  });
  changes.push(`Delegation active: ${turns} turns`);
}

    // ---- CONTRACT TYPES ----
    else {
      const iMin = clampInt(fn.special.incomeMin ?? 0, 0);
      const iMax = clampInt(fn.special.incomeMax ?? iMin, iMin);
      const baseIncome = randBetween(iMin, iMax);

      if(incomeMult === 0){
        summary = `Negotiations sour. Ink never touches parchment.`;
      } else {
        const perTurn = clampInt(Math.floor(baseIncome * incomeMult), 0);

        const title =
          kind === "arbitration" ? "Arbitration Authority"
          : kind === "consortium" ? "Trade Consortium"
          : "Trade Agreement";

        const rec = {
          id: uid(),
          title,
          clan: String(opt),
          turnsLeft: turns,
          incomePerTurn: perTurn
        };

        if(kind === "arbitration") addContract("arbitrations", rec);
        else if(kind === "consortium") addContract("consortiums", rec);
        else addContract("agreements", rec);

         if(kind === "consortium"){
  state.tradeNetwork.active = true;

  // If no routes exist yet, seed one starter route for the chosen clan
  if(!Array.isArray(state.tradeNetwork.routes)) state.tradeNetwork.routes = [];
  const ck = clanKey(opt);
  if(ck){
    const meta = CLAN_TRADE[ck] || { name: opt, commodity: "Goods", risk:"medium" };

    const exists = state.tradeNetwork.routes.some(r => String(r.clan).toLowerCase() === meta.name.toLowerCase());
    if(!exists){
      state.tradeNetwork.routes.push({
        id: uid(),
        clan: meta.name,
        commodity: meta.commodity,
        risk: meta.risk,
        yieldGP: perTurn,             // uses the consortium income you already rolled
        stabilityDC: 12,              // base DC, modified by risk/strategy/stability
        status: "active"              // active | disrupted
      });
      changes.push(`Trade Network: Route opened (${meta.name})`);
    }
  }

  changes.push(`Market Stability: ${clampInt(state.tradeNetwork.stability ?? 75, 0, 100)}%`);
}

        appendToWarehouse(`${rec.title} Contract`, 1, "", "Hall of Emissaries");

        summary =
          tier === "critical_success" ? `The deal is legendary. Other emissaries will quote this contract for years.` :
          tier === "great_success" ? `A strong deal. Clean clauses. Better margins.` :
          tier === "failure" ? `A deal, but you concede ground. The margins are thinner.` :
          `Terms are acceptable. The contract is sealed.`;
      }
    }

    // 3) Resolution popup
    const changeListHtml = changes.length
      ? `<ul class="siResList">${changes.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
      : `<div class="small muted">No tracked changes.</div>`;

    const narrative = clanReactionLine(opt, tier);

      await openSIModal({
  title: "Order Resolved",
  bodyHtml: `
        <div class="siResTop">
          <div class="siResAction">${escapeHtml(fn.label)}</div>
          <div class="siResTarget">Target: <b>${escapeHtml(String(opt))}</b></div>
        </div>

        <div class="siResRoll">
          <div><b>Roll</b>: d20 (${escapeHtml(String(roll.d20))}) ${mod >= 0 ? "+" : ""}${escapeHtml(String(mod))} = <b>${escapeHtml(String(roll.total))}</b></div>
          <div><b>DC</b>: ${escapeHtml(String(dc))} • <b>${escapeHtml(formatTier(tier))}</b></div>
        </div>

        <div class="siResSummary">${escapeHtml(summary)}</div>
        <div class="siResSummary">${escapeHtml(narrative)}</div>

        <div class="siResChanges">
          <div class="siResChangesTitle">Applied Changes</div>
          ${changeListHtml}
        </div>
      `,
      primaryText: "Continue",
  modalClass: "siModal--hall"
});

    log("Order Resolved", `${fn.label} (${opt}) → ${formatTier(tier)}. ${narrative} ${summary}`);
    ui.treasuryInput.value = String(state.treasuryGP);
    saveState();
    render();
    return;
  }

// Upgrade facility (Level Up)
if(fac.id === "hall_of_emissaries" && fn.special && fn.special.type === "upgrade_facility"){
  ensureDiplomacyState();
  const cur = getFacilityLevel(fac.id);
  const max = clampInt(fn.special.maxLevel ?? 3, 1, 3);

  if(cur >= max){
    log("Upgrade", "Hall of Emissaries is already max level.");
    return;
  }

  const next = cur + 1;
  const cost = clampInt(fn.special.costByNextLevel?.[String(next)] ?? 0, 0);

  // Cost already paid when order was issued (treasury is deducted at issue time),
  // but in case anything changes later, keep it simple and just apply the level.
  setFacilityLevel(fac.id, next);

  log("Upgrade", `Hall of Emissaries upgraded to Level ${next}.`);
  saveState();
  render();
  return;
}
    
  // Dock charter → warehouse
  if(fac.id==="dock" && fn.id==="charter_berth"){
    appendToWarehouse(optionLabel || "Chartered vessel", 1, "", "Dock");
    log("Order Completed", `${label} → Added to Warehouse.`);
    return;
  }

  // Workshop craft (tool table random)
  if(fac.id==="workshop" && fn.id==="craft" && chosen && chosen.craftItem){
  appendToWarehouse(chosen.craftItem, 1, "", "Workshop");
  log("Order Completed", `${label} → Crafted: ${chosen.craftItem}.`);
  return;
}

  // Generic craft/harvest/trade → warehouse (if option chosen)
  if(optionLabel){
    appendToWarehouse(optionLabel, 1, "", fac.name);
    log("Order Completed", `${label} → Added to Warehouse.`);
    return;
  }

  log("Order Completed", `${label} → Completed.`);
}

  // ---------- Render ----------
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

    renderEventBox();
    renderFacilities();
    renderLog();
    renderFavour();
    renderPoliticalCapital();
    renderDiplomaticAssets(); 

    // update treasury input (in case actions changed it)
    ui.treasuryInput.value = String(state.treasuryGP);
  }

  function renderList(el, arr, emptyText){
    if(!arr || arr.length===0){
      el.innerHTML = `<div class="small muted">${escapeHtml(emptyText)}</div>`;
      return;
    }
    el.innerHTML = arr.map((it, idx) => `
      <div class="item">
        <div>
          <div class="item__name">${escapeHtml(it.name)}</div>
          <div class="item__meta">${escapeHtml(metaLine(it))}</div>
        </div>
        <button class="item__btn" data-remove="${idx}">Remove</button>
      </div>
    `).join("");
    el.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = clampInt(btn.getAttribute("data-remove"), 0);
        arr.splice(i,1);
        saveState();
        render();
      });
    });
  }

  function metaLine(it){
    const parts = [];
    if(it.qty && it.qty !== 1) parts.push(`x${it.qty}`);
    if(it.source) parts.push(it.source);
    return parts.join(" • ") || "—";
  }

  function renderEventBox(){
    const le = state.lastEvent;
    if(!le){
      ui.eventBox.classList.add("muted");
      ui.eventBox.innerHTML = `Click <b>Roll Bastion Event</b> to generate a 1d100 event.`;
      return;
    }
    ui.eventBox.classList.remove("muted");
    const lines = (le.lines || []).slice(0, 12);
    ui.eventBox.innerHTML = `
      <div class="evTitle">${escapeHtml(le.name)}</div>
      <div class="evRoll">Roll: ${escapeHtml(String(le.roll))}</div>
      ${lines.length ? `<ul>${lines.map(l=>`<li>${escapeHtml(String(l))}</li>`).join("")}</ul>` : `<div class="small muted">No description text found in data.</div>`}
      <div class="small muted" style="margin-top:10px">DM note: Some events reference tables from the DMG / Bastion rules. Add your own roll results into the warehouse or log.</div>
    `;
  }

  // ---------------- Warehouse (table) ----------------
// State shape: [{ id, item, qty, gp, notes }]

function ensureWarehouseShape(){
  if(!Array.isArray(state.warehouse)) state.warehouse = [];

  // If old warehouse items exist ({name, qty, source}) convert them once
  const looksOld = state.warehouse.some(x => x && typeof x === "object" && ("name" in x) && !("item" in x));
  if(looksOld){
    state.warehouse = state.warehouse.map(x => ({
      id: uid(),
      item: String(x.name ?? "New Item"),
      qty: clampInt(x.qty ?? 1, 0),
      gp: "",
      notes: x.source ? String(x.source) : ""
    }));
    saveState();
  }
}

function uid(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function renderWarehouse(){
  ensureWarehouseShape();
  if(!whTableBody) return;

  whTableBody.innerHTML = "";

  if(state.warehouse.length === 0){
    state.warehouse.push({ id: uid(), item: "New Item", qty: 1, gp: "", notes: "" });
  }

  for(const row of state.warehouse){
    const el = document.createElement("div");
    el.className = "whRow";
    el.dataset.id = row.id;

    el.innerHTML = `
      <input class="whItem" type="text" value="${escapeHtml(String(row.item ?? ""))}" />
      <input class="whQty" type="number" min="0" step="1" value="${clampInt(row.qty ?? 0, 0)}" />
      <input class="whGp" type="text" value="${escapeHtml(String(row.gp ?? ""))}" placeholder="-" />
      <input class="whNotes" type="text" value="${escapeHtml(String(row.notes ?? ""))}" placeholder="notes..." />
      <button class="btn whBtn" data-act="remove">Remove</button>
    `;
    whTableBody.appendChild(el);
  }
}

function readWarehouseFromUI(){
  ensureWarehouseShape();
  if(!whTableBody) return;

  const rows = Array.from(whTableBody.querySelectorAll(".whRow"));
  const next = [];

  for(const r of rows){
    const id = r.dataset.id || uid();
    const item = r.querySelector(".whItem")?.value?.trim() || "New Item";
    const qty = clampInt(r.querySelector(".whQty")?.value ?? 0, 0);
    const gp = r.querySelector(".whGp")?.value?.trim() || "";
    const notes = r.querySelector(".whNotes")?.value?.trim() || "";

    // keep meaningful rows
    if(item || qty || gp || notes){
      next.push({ id, item, qty, gp, notes });
    }
  }

  state.warehouse = next;
}

function addWarehouseRow(prefill){
  readWarehouseFromUI();
  state.warehouse.push({
    id: uid(),
    item: prefill?.item ?? "New Item",
    qty: prefill?.qty ?? 1,
    gp: prefill?.gp ?? "",
    notes: prefill?.notes ?? ""
  });
  renderWarehouse();
}

function removeWarehouseRow(id){
  readWarehouseFromUI();
  state.warehouse = state.warehouse.filter(x => x.id !== id);
  renderWarehouse();
}

function saveWarehouse(){
  readWarehouseFromUI();
  saveState();
  log("Warehouse", "Saved warehouse.");
  renderLog();
}

// Append/merge outputs into warehouse
function appendToWarehouse(itemName, qty=1, gp="", notes=""){
  readWarehouseFromUI();

  const name = String(itemName || "").trim();
  if(!name) return;

  const q = clampInt(qty, 1);

  const found = state.warehouse.find(x => String(x.item||"").toLowerCase() === name.toLowerCase());
  if(found){
    found.qty = clampInt((found.qty ?? 0) + q, 0);
    if(notes && !String(found.notes||"").includes(notes)){
      found.notes = (found.notes ? (found.notes + " | ") : "") + notes;
    }
  } else {
    state.warehouse.push({ id: uid(), item: name, qty: q, gp: gp ?? "", notes: notes ?? "" });
  }

  saveState();
  renderWarehouse();
}

// Warehouse UI wiring
if(addWarehouseRowBtn){
  addWarehouseRowBtn.addEventListener("click", () => addWarehouseRow());
}
if(saveWarehouseBtn){
  saveWarehouseBtn.addEventListener("click", () => saveWarehouse());
}
if(clearWarehouseBtn){
  clearWarehouseBtn.addEventListener("click", () => {
    state.warehouse = [];
    saveState();
    log("Warehouse", "Cleared warehouse.");
    renderWarehouse();
    renderLog();
  });
}
if(whTableBody){
  whTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act='remove']");
    if(!btn) return;
    const row = e.target.closest(".whRow");
    if(!row) return;
    removeWarehouseRow(row.dataset.id);
  });
}

   function constructionSlotsForLevel(level){
  const lvl = clampInt(level, 1, 20);
  if(lvl >= 17) return 6;
  if(lvl >= 13) return 5;
  if(lvl >= 9)  return 4;
  if(lvl >= 5)  return 2;
  return 0;
}

   // ---------------- Diplomacy / Hall of Emissaries ----------------

function ensureDiplomacyState(){
  if(!state.facilityLevels) state.facilityLevels = {};

  if(!state.diplomacy){
    state.diplomacy = {
      agreements: [],     // { id, title, clan, turnsLeft, incomePerTurn }
      delegations: [],    // { id, title, clan, turnsLeft }
      summits: [],        // { id, title, pair, turnsLeft, costReductionPct }
      arbitrations: [],   // same as agreements style
      consortiums: [],    // same as agreements style

      // Safe defaults:
      rep: 0,             // -5..+5 (legacy/general diplomacy rep, ok to keep even if not used much)
      cooldowns: {},      // { [kindOrFnId]: turnsLeft }
      tokens: 0           // Diplomatic Assets: Favour Tokens
    };
  } else {
    // Backwards compatibility for old saves
    if(typeof state.diplomacy.rep !== "number") state.diplomacy.rep = 0;

    if(!state.diplomacy.cooldowns || typeof state.diplomacy.cooldowns !== "object"){
      state.diplomacy.cooldowns = {};
    }

    if(typeof state.diplomacy.tokens !== "number"){
      state.diplomacy.tokens = 0;
    }
  }

  // Default built facilities to level 1 if missing
  const built = builtFacilityIds();
  for(const id of built){
    if(state.facilityLevels[id] == null) state.facilityLevels[id] = 1;
  }

  saveState();
}

function getFacilityLevel(facId){
  return clampInt(state.facilityLevels?.[facId] ?? 1, 1, 3);
}

function setFacilityLevel(facId, lvl){
  if(!state.facilityLevels) state.facilityLevels = {};
  state.facilityLevels[facId] = clampInt(lvl, 1, 3);
  saveState();
}

   // ---------------- SI Modal System (generic, reusable) ----------------

function openSIModal({ title, bodyHtml, primaryText = "Close", modalClass = "" }){
  return new Promise(resolve => {
    // Overlay
    const ov = document.createElement("div");
    ov.className = "siModalOverlay";
    ov.innerHTML = `
      <div class="siModal ${modalClass ? String(modalClass) : ""}" role="dialog" aria-modal="true">
        <div class="siModalHead">
          <div class="siModalTitle">${escapeHtml(title || "")}</div>
          <button class="siModalX" type="button" aria-label="Close">✕</button>
        </div>
        <div class="siModalBody">${bodyHtml || ""}</div>
        <div class="siModalFoot">
          <button class="btn btn--primary siModalClose" type="button">${escapeHtml(primaryText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const close = () => {
      ov.remove();
      resolve();
    };

    ov.addEventListener("click", (e) => {
      if(e.target === ov) close();
    });
    ov.querySelector(".siModalX")?.addEventListener("click", close);
    ov.querySelector(".siModalClose")?.addEventListener("click", close);

    // ESC closes
    const onKey = (e) => {
      if(e.key === "Escape"){
        document.removeEventListener("keydown", onKey);
        close();
      }
    };
    document.addEventListener("keydown", onKey);
  });
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function rollD20Animated({ title, mod = 0, dc = null, modalClass = "" }){
  const ov = document.createElement("div");
  ov.className = "siModalOverlay";
  ov.innerHTML = `
    <div class="siModal siModal--dice ${modalClass ? String(modalClass) : ""}" role="dialog" aria-modal="true">
      <div class="siModalHead">
        <div class="siModalTitle">${escapeHtml(title || "Rolling…")}</div>
        <div class="siDiceMeta">
          <span class="siDiceChip">d20</span>
          <span class="siDiceChip">${mod >= 0 ? "+" : ""}${escapeHtml(String(mod))}</span>
          ${dc != null ? `<span class="siDiceChip">DC ${escapeHtml(String(dc))}</span>` : ""}
        </div>
      </div>
      <div class="siModalBody">
        <div class="siDiceNumber" id="siDiceNumber">?</div>
        <div class="small muted" style="margin-top:10px">The seal wax cracks. A quill pauses mid-stroke.</div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  const numberEl = ov.querySelector("#siDiceNumber");
  const final = clampInt(d(20), 1, 20);
  const total = final + clampInt(mod, -50, 50);

  // roll animation 0.8–1.2s
  const duration = 800 + Math.floor(Math.random() * 400);
  const start = Date.now();

  while(Date.now() - start < duration){
    if(numberEl) numberEl.textContent = String(clampInt(d(20), 1, 20));
    await sleep(55);
  }

  if(numberEl) numberEl.textContent = String(final);

  // tiny pause so it “lands”
  await sleep(260);

  ov.remove();
  return { d20: final, total };
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

    <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap">
      <button class="btn btn--ghost" type="button" id="siManualRollBtn">Roll 1d20</button>
      <div class="small muted" id="siManualPreview" style="align-self:center"></div>
    </div>
  `;

  // Open a choice modal that lets us collect input values on confirm
  const res = await openSIModalChoice({
    title: title || "Roll",
    bodyHtml,
    primaryText: "Continue",
    secondaryText: "Cancel",
    modalClass,
    collectIds: ["siManualD20"]
  });

  // If user cancelled
  if(res.action !== "ok") return null;

  // Parse typed d20
  const d20 = clampInt(res.values.siManualD20 ?? 10, 1, 20);
  const total = d20 + clampInt(mod, -50, 50);
  return { d20, total };
}

function openSIModalChoice({
  title,
  bodyHtml,
  primaryText = "Confirm",
  secondaryText = "Cancel",
  modalClass = "",
  collectIds = []
}){
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "siModalOverlay";
    ov.innerHTML = `
      <div class="siModal ${modalClass ? String(modalClass) : ""}" role="dialog" aria-modal="true">
        <div class="siModalHead">
          <div class="siModalTitle">${escapeHtml(title || "")}</div>
          <button class="siModalX" type="button" aria-label="Close">✕</button>
        </div>
        <div class="siModalBody">${bodyHtml || ""}</div>
        <div class="siModalFoot" style="justify-content:space-between">
          <button class="btn btn--ghost siModalSecondary" type="button">${escapeHtml(secondaryText)}</button>
          <button class="btn btn--primary siModalPrimary" type="button">${escapeHtml(primaryText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const snapshotValues = () => {
      const values = {};
      for(const id of (collectIds || [])){
        const el = ov.querySelector(`#${CSS.escape(id)}`);
        if(el && "value" in el) values[id] = el.value;
      }
      return values;
    };

    const close = (action) => {
      const values = (action === "ok") ? snapshotValues() : {};
      ov.remove();
      resolve({ action, values });
    };

    ov.addEventListener("click", (e) => { if(e.target === ov) close("cancel"); });
    ov.querySelector(".siModalX")?.addEventListener("click", ()=>close("cancel"));
    ov.querySelector(".siModalSecondary")?.addEventListener("click", ()=>close("cancel"));
    ov.querySelector(".siModalPrimary")?.addEventListener("click", ()=>close("ok"));
         // Optional: if a manual roll button exists in the modal, wire it
    const rollBtn = ov.querySelector("#siManualRollBtn");
    const rollInput = ov.querySelector("#siManualD20");
    const preview = ov.querySelector("#siManualPreview");
    if(rollBtn && rollInput){
      rollBtn.addEventListener("click", ()=>{
        const v = clampInt(1 + Math.floor(Math.random()*20), 1, 20);
        rollInput.value = String(v);
        if(preview) preview.textContent = `Rolled: ${v}`;
      });
    }

    const onKey = (e) => {
      if(e.key === "Escape"){
        document.removeEventListener("keydown", onKey);
        close("cancel");
      }
    };
    document.addEventListener("keydown", onKey);
  });
}
// ---------------- Clan Trade Meta (GLOBAL) ----------------
const CLAN_TRADE = {
  blackstone: { name:"Blackstone", commodity:"Timber", risk:"low" },
  bacca:      { name:"Bacca",      commodity:"Weapons", risk:"medium" },
  slade:      { name:"Slade",      commodity:"Steel", risk:"medium" },
  rowthorn:   { name:"Rowthorn",   commodity:"Maritime", risk:"low" },
  karr:       { name:"Karr",       commodity:"Wool & Furs", risk:"high" },
  molten:     { name:"Molten",     commodity:"Precious Metals", risk:"high" },
  farmer:     { name:"Farmer",     commodity:"Livestock", risk:"high" },
};
// =========================
// Trade Map Route Overlay
// Uses a stable 0..1000 coordinate space (viewBox)
// =========================

const TRADE_MAP_OVERLAY = {
  viewBox: 1000,

  // NOTE: These points are in "map space" (0..1000).
  // If you ever want to tweak a route, edit the arrays below.
  // Goal: sea lanes that avoid land and feel like coastal shipping routes.

  ironbow: [760, 610], // approx Ironbow label/arrow location

  hubs: {
    Blackstone: [360, 250],
    Karr:       [820, 180],
    Bacca:      [610, 610],
    Farmer:     [170, 690],
    Molten:     [270, 880],
    Slade:      [780, 820],
    Rowthorn:   [840, 860],
  },

  // Curved-ish lanes using waypoint polylines (dotted stroke makes it feel nautical)
  paths: {
    Blackstone: [[760,610],[680,560],[560,460],[450,360],[360,250]],
    Karr:       [[760,610],[820,520],[880,420],[880,280],[820,180]],
    Bacca:      [[760,610],[700,620],[650,615],[610,610]],
    Farmer:     [[760,610],[660,690],[520,740],[380,760],[250,730],[170,690]],
    Molten:     [[760,610],[650,720],[520,800],[400,850],[270,880]],
    Slade:      [[760,610],[780,690],[790,760],[780,820]],
    Rowthorn:   [[760,610],[820,680],[880,760],[860,860]],
  }
};

function getActiveRouteClans(){
  const set = new Set();

  // From Trade Network
  if(state.tradeNetwork?.active){
    (state.tradeNetwork.routes || []).forEach(r=>{
      if(!r || r.status === "removed") return;
      const name = String(r.clan || "").trim();
      if(name) set.add(name);
    });
  }

  // Optional: also show Trade Agreements as routes
  if(state.diplomacy?.agreements){
    state.diplomacy.agreements.forEach(a=>{
      if(!a || a.turnsLeft <= 0) return;
      const name = String(a.clan || "").trim();
      if(name) set.add(name);
    });
  }

  return Array.from(set);
}

function svgPathFromPoints(points){
  if(!points || !points.length) return "";
  return "M " + points.map(p => `${p[0]} ${p[1]}`).join(" L ");
}

function renderTradeRouteOverlaySvg(clans){
  const vb = TRADE_MAP_OVERLAY.viewBox;
  const lines = [];

  // Always mark Ironbow start
  lines.push(`<circle class="tradeRouteDot" cx="${TRADE_MAP_OVERLAY.ironbow[0]}" cy="${TRADE_MAP_OVERLAY.ironbow[1]}" r="7"></circle>`);

  for(const clan of clans){
    const pts = TRADE_MAP_OVERLAY.paths[clan];
    if(!pts) continue;

    const d = svgPathFromPoints(pts);
    const end = pts[pts.length - 1];

    lines.push(`<path class="tradeRouteLine" d="${d}"></path>`);
    lines.push(`<circle class="tradeRouteDot" cx="${end[0]}" cy="${end[1]}" r="7"></circle>`);
  }

  return `
    <svg class="tradeMapSvg" viewBox="0 0 ${vb} ${vb}" preserveAspectRatio="none" aria-hidden="true">
      ${lines.join("\n")}
    </svg>
  `;
}

function clanKey(label){
  // returns: "blackstone" | "bacca" | ... or null
  return clanIdFromLabel(label);
}

// ---------------- Diplomacy action math ----------------

function diplomacyModForHall(){
  const hallLvl = getFacilityLevel("hall_of_emissaries");
  const rep = clampInt(state.diplomacy?.rep ?? 0, -5, 5);

  // Hall level matters a lot, rep matters a little
  const hallBonus = hallLvl === 1 ? 2 : hallLvl === 2 ? 4 : 6;
  return hallBonus + rep;
}

function diplomacyCooldownTurnsLeft(key){
  const cd = state.diplomacy?.cooldowns?.[key];
  return clampInt(cd ?? 0, 0, 99);
}

function setDiplomacyCooldown(key, turns){
  ensureDiplomacyState();
  const t = clampInt(turns, 0, 99);
  if(!state.diplomacy.cooldowns) state.diplomacy.cooldowns = {};
  if(t <= 0) delete state.diplomacy.cooldowns[key];
  else state.diplomacy.cooldowns[key] = t;
}

function adjustDiplomacyRep(delta){
  ensureDiplomacyState();
  state.diplomacy.rep = clampInt((state.diplomacy.rep ?? 0) + clampInt(delta, -10, 10), -5, 5);
}

function tierFromRoll(d20, total, dc){
  const nat20 = d20 === 20;
  const nat1  = d20 === 1;

  if(nat20) return "critical_success";
  if(nat1)  return "critical_failure";

  if(total >= dc + 5) return "great_success";
  if(total >= dc)     return "success";
  if(total <= dc - 5) return "bad_failure";
  return "failure";
}

function formatTier(t){
  if(t === "critical_success") return "Critical Success";
  if(t === "great_success") return "Great Success";
  if(t === "success") return "Success";
  if(t === "failure") return "Failure";
  return "Bad Failure";
}
function clanReactionLine(clanLabel, tier){
  const clan = String(clanLabel || "").trim();
  const good = [
    `${clan} accepts with measured approval.`,
    `${clan}'s envoy nods once, and the room quietly shifts.`,
    `A seal is pressed. ${clan} seems satisfied.`
  ];
  const mid = [
    `${clan} agrees, but their eyes keep counting.`,
    `${clan} watches carefully. Nothing is free.`,
    `The ink dries. The court stays quiet.`
  ];
  const bad = [
    `${clan} withdraws behind polite smiles.`,
    `${clan}'s envoy leaves without finishing their wine.`,
    `A quiet insult lands like a thrown gauntlet. ${clan} remembers.`
  ];
   
  if(tier === "critical_success" || tier === "great_success") return good[Math.floor(Math.random()*good.length)];
  if(tier === "success") return mid[Math.floor(Math.random()*mid.length)];
  return bad[Math.floor(Math.random()*bad.length)];
}

async function openHallPlanningModal(facId, fnId){
  const fac = DATA.facilities.find(f => f.id === facId);
  if(!fac) return null;
  const fn = (fac.functions || []).find(x => x.id === fnId);
  if(!fn || fac.id !== "hall_of_emissaries" || fn.special?.type !== "emissary_action") return null;

  const kind = String(fn.special.kind || "");
  let options = (fn.options || []).map((o, idx) => {
  const label = o.label || String(o);
  return { idx, label };
});

// If this function has no options in facilities.json, generate all clans automatically
if(options.length === 0){
  const clanNames = ["Blackstone","Karr","Bacca","Farmer","Molten","Slade","Rowthorn"];
  options = clanNames.map((label, idx) => ({ idx, label }));
}

  // Default to whatever is currently selected on the card
  const sel = document.getElementById(`sel_${facId}__${fnId}`);
  const defaultIdx = clampInt(sel ? sel.value : 0, 0);

  const durationChoices = [1,3,6];
  const defaultDur = durationChoices.includes(fn.special.durationTurns) ? fn.special.durationTurns : 3;

  let extraHtml = "";

  if(kind === "trade_agreement"){
    extraHtml = `
  <div style="margin-top:10px" class="field">
    <div>Duration</div>
    <select id="hallDurSel">
      ${durationChoices.map(t=>`<option value="${t}" ${t===defaultDur?"selected":""}>${t} turn${t===1?"":"s"}</option>`).join("")}
    </select>
  </div>
  <div class="siResSummary" style="margin-top:12px">
    <b>Projected:</b> A negotiation roll will determine income/turn, duration stability, and Political Capital change.
  </div>
`;
  }

  if(kind === "host_delegation"){
    extraHtml = `
  <div style="margin-top:10px" class="field">
    <div>Tone</div>
    <select id="hallToneSel">
      <option value="conciliatory">Conciliatory (safer)</option>
      <option value="assertive">Assertive (balanced)</option>
      <option value="opportunistic">Opportunistic (higher risk)</option>
    </select>
  </div>
  <div class="siResSummary" style="margin-top:12px">
    <b>Projected:</b> Two rolls (Diplomacy + Insight). Strong results can award a Favour Token.
  </div>
`;
  }

  // Generic preview for other kinds for now
  if(kind !== "trade_agreement" && kind !== "host_delegation"){
    extraHtml = `
      <div class="siResSummary" style="margin-top:12px">
        <b>Projected:</b> Political Capital shifts on resolution. Duration and income are affected by your roll tier.
      </div>
    `;
  }

  const bodyHtml = `
  <div>
    <div class="field">
      <div>Select target</div>
      <select id="hallClanSel">
        ${options.map(o => `<option value="${o.idx}" ${o.idx===defaultIdx?"selected":""}>${escapeHtml(o.label)}</option>`).join("")}
      </select>
    </div>
    ${extraHtml}
  </div>
`;

  const actionVerb =
    kind === "trade_agreement" ? "Negotiate" :
    kind === "host_delegation" ? "Receive Delegation" :
    "Proceed";

  const res = await openSIModalChoice({
  title: fn.label,
  bodyHtml,
  primaryText: actionVerb,
  secondaryText: "Cancel",
  modalClass: "siModal--hall",
  collectIds: ["hallClanSel", "hallDurSel", "hallToneSel"]
});

if(res.action !== "ok") return null;

const chosenIdx = clampInt(res.values.hallClanSel ?? defaultIdx, 0);

const meta = {};
if(kind === "trade_agreement"){
  meta.durationTurns = clampInt(res.values.hallDurSel ?? defaultDur, 1, 30);
}
if(kind === "host_delegation"){
  meta.tone = String(res.values.hallToneSel || "assertive");
}

  // Always store the chosen clan label (important for functions that have no fn.options in facilities.json)
  meta.targetClan = String((options[chosenIdx] && options[chosenIdx].label) ? options[chosenIdx].label : "");
  return { optionIdx: chosenIdx, meta };
}
// Create a UI panel dynamically (so you don't need to edit HTML)
function ensureDiplomacyPanel(){
  if(document.getElementById("diplomacyPanel")) return;
  if(!whTableBody) return;

  const whCard = whTableBody.closest(".card");
  if(!whCard) return;

  const panel = document.createElement("section");
  panel.className = "card fullRow";
  panel.id = "diplomacyPanel";

  panel.innerHTML = `
    <div class="card__head dipHead">
      <!-- LEFT header -->
      <div class="dipHeadLeft">
        <h2>Diplomacy & Trade</h2>
        <div class="small muted" id="diplomacyMeta">Contracts and influence generated by the Hall of Emissaries.</div>
      </div>

      <!-- RIGHT header (Hall title aligned on same line) -->
      <div class="dipHeadRight">
        <div class="hallHeadRow">
          <div class="hallHeadTitle">Hall of Emissaries</div>
          <div class="hallLevel" id="hallLevelBadge">L1</div>
          <button class="pill" id="hallUpgradePill" title="Upgrade Hall">Upgrade</button>
          <button class="pill" id="btnViewTradeRoutes" title="View active sea trade routes">Routes</button>
<button class="pill" id="btnResolveTradeRoutes" title="Resolve this turn's trade routes">Resolve</button>
        </div>
        <div class="small muted" id="hallHeadSub">Diplomatic actions take 1 Bastion Turn.</div>
      </div>
    </div>

    <div class="dipGrid">

      <!-- LEFT: diplomacy records -->
      <div class="dipLeft">
        <div id="dipBoxes" class="dipBoxes"></div>
      </div>

      <!-- RIGHT: Hall of Emissaries lives here -->
      <div class="dipRight">
        <div id="hallCard" class="hallCard"></div>
      </div>
    </div>

    <div class="dipFoot">
      <button class="btn ghost" id="clearDiplomacyBtn">Clear Diplomacy Records</button>
    </div>
  `;

  whCard.parentElement.insertBefore(panel, whCard);

    // Trade network header buttons
  panel.querySelector("#btnViewTradeRoutes")?.addEventListener("click", () => {
    openTradeMapModal();
  });
  panel.querySelector("#btnResolveTradeRoutes")?.addEventListener("click", () => {
    resolveTradeRoutesModal();
  });

   panel.querySelector("#clearDiplomacyBtn").addEventListener("click", () => {
    if(!confirm("Clear Diplomacy & Trade records? (Does not undo gold already gained.)")) return;
    state.diplomacy = { agreements: [], delegations: [], summits: [], arbitrations: [], consortiums: [], rep: 0, cooldowns: {}, tokens: 0 };
    saveState();
    log("Diplomacy", "Cleared diplomacy records.");
    render();
  });
}

function renderDiplomacy(){
  const meta = document.getElementById("diplomacyMeta");
  const boxes = document.getElementById("dipBoxes");
  const hallCard = document.getElementById("hallCard");
  const hallLevelBadge = document.getElementById("hallLevelBadge");
  const hallUpgradePill = document.getElementById("hallUpgradePill");
  const hallHeadSub = document.getElementById("hallHeadSub");
  if(!meta || !boxes || !hallCard || !hallLevelBadge || !hallUpgradePill || !hallHeadSub) return;

  ensureDiplomacyState();

  const d = state.diplomacy || { agreements:[], delegations:[], summits:[], arbitrations:[], consortiums:[] };

  const passiveIncome =
    [...(d.agreements||[]), ...(d.arbitrations||[]), ...(d.consortiums||[])]
      .reduce((a,x)=>a + (x.incomePerTurn||0), 0);

  meta.textContent = passiveIncome > 0
    ? `Active passive income: +${passiveIncome} gp per Bastion Turn.`
    : `No active contracts. Use the Hall of Emissaries to create agreements, summits and charters.`;

  // LEFT SIDE: compact boxes
  function sectionBox(title, arr){
    if(!arr || arr.length === 0){
      return `
        <div class="dipBox">
          <div class="dipBoxTitle">${escapeHtml(title)}</div>
          <div class="small muted">None.</div>
        </div>
      `;
    }

    const rows = arr.map(x => {
      const extra = x.incomePerTurn ? ` • +${x.incomePerTurn} gp/turn` : "";
      const who = x.clan || x.pair || "—";
      return `
        <div class="dipRow">
          <div class="dipRowName">${escapeHtml(x.title || "Record")}</div>
          <div class="dipRowMeta">${escapeHtml(who)} • ${x.turnsLeft} turns remaining${escapeHtml(extra)}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="dipBox">
        <div class="dipBoxTitle">${escapeHtml(title)}</div>
        ${rows}
      </div>
    `;
  }

  boxes.innerHTML = `
    ${sectionBox("Trade Agreements", d.agreements)}
    ${sectionBox("Delegations", d.delegations)}
    ${sectionBox("Summits", d.summits)}
    ${sectionBox("Arbitration", d.arbitrations)}
    ${sectionBox("Consortiums", d.consortiums)}
  `;

  // RIGHT SIDE: Hall card inside diplomacy panel
  const hall = DATA.facilities.find(f => f.id === "hall_of_emissaries");
  const built = builtFacilityIds().includes("hall_of_emissaries");

  if(!hall){
    hallCard.innerHTML = `<div class="small muted">Hall of Emissaries data not found.</div>`;
    return;
  }

  const hallLvl = getFacilityLevel("hall_of_emissaries");
   // Update Hall header UI (aligned with Diplomacy title)
hallLevelBadge.textContent = `L${hallLvl}`;
hallUpgradePill.disabled = !built;
hallHeadSub.textContent = built
  ? "Diplomatic actions take 1 Bastion Turn."
  : "Not built yet. Build it in Construction to unlock diplomacy actions.";

hallUpgradePill.onclick = () => {
  if(!built) return;
  issueOrder("hall_of_emissaries", "upgrade_hall");
};

  const imgFile = FACILITY_IMG["hall_of_emissaries"];
  const imgHtml = imgFile
    ? `<div class="hallImgWrap"><img class="hallImg" src="${withBase(`assets/facilities/${imgFile}`)}" alt="Hall of Emissaries"></div>`
    : `<div class="hallImgWrap"><div class="small muted">No image</div></div>`;

  if(!built){
    hallCard.innerHTML = `
      <div class="hallTop">
        <div>
          <div class="hallName">Hall of Emissaries</div>
          <div class="small muted">Not built yet. Build it in Construction to unlock diplomacy actions.</div>
        </div>
      </div>
      ${imgHtml}
    `;
    return;
  }

  // Upgrade button (pill) runs upgrade function
  const upgradeFn = (hall.functions || []).find(fn => fn.id === "upgrade_hall");
  const upgradeBtn = upgradeFn
    ? `<button class="pill" data-action="hallUpgrade" title="Upgrade Hall">Upgrade</button>`
    : "";

  const fnHtml = (hall.functions || [])
    .filter(fn => fn.id !== "upgrade_hall") // keep upgrade separate as pill
    .map(fn => {
      const req = clampInt(fn.requiredFacilityLevel ?? 1, 1, 3);
      const locked = hallLvl < req;
      return renderFunction(hall, fn, locked);
    }).join("");

  hallCard.innerHTML = `
  <div class="hallBody">
    ${imgHtml}
    <div class="hallFns">
      ${fnHtml}
    </div>
  </div>
`;


  // Wire all hall function buttons rendered by renderFunction()
  hallCard.querySelectorAll("[data-action='runFn']").forEach(btn => {
    btn.addEventListener("click", async () => {
  const facId = btn.getAttribute("data-fac");
  const fnId = btn.getAttribute("data-fn");

  // Hall emissary actions get the planning modal
  const fac = DATA.facilities.find(f => f.id === facId);
  const fn = fac ? (fac.functions || []).find(x => x.id === fnId) : null;

  if(facId === "hall_of_emissaries" && fn?.special?.type === "emissary_action"){
    const plan = await openHallPlanningModal(facId, fnId);
    if(!plan) return;
    issueOrderWithMeta(facId, fnId, plan.optionIdx, plan.meta);
    return;
  }

  // Everything else unchanged
  issueOrder(facId, fnId);
});
  });
}

function tickDiplomacyOnAdvanceTurn(){
  const d = state.diplomacy;
  if(!d) return;

  // Apply passive income
  const incomeSources = [...(d.agreements||[]), ...(d.arbitrations||[]), ...(d.consortiums||[])];
  const income = incomeSources.reduce((a,x)=>a + (x.incomePerTurn||0), 0);
  if(income > 0){
    state.treasuryGP += income;
    log("Diplomacy", `Contract income received: +${income} gp.`);
  }

  function dec(arr){
    if(!Array.isArray(arr)) return [];
    for(const x of arr) x.turnsLeft = clampInt(x.turnsLeft - 1, 0);
    return arr.filter(x => x.turnsLeft > 0);
  }

  d.agreements = dec(d.agreements);
  d.delegations = dec(d.delegations);
  d.summits = dec(d.summits);
  d.arbitrations = dec(d.arbitrations);
  d.consortiums = dec(d.consortiums);

     // NEW: tick diplomacy cooldowns
  if(d.cooldowns && typeof d.cooldowns === "object"){
    for(const k of Object.keys(d.cooldowns)){
      d.cooldowns[k] = clampInt(d.cooldowns[k] - 1, 0);
      if(d.cooldowns[k] <= 0) delete d.cooldowns[k];
    }
  }

  saveState();
}
   // =========================
// Trade Network (Routes)
// =========================

function routeDC(route){
  const base = 12;
  const stab = clampInt(state.tradeNetwork?.stability ?? 75, 0, 100);

  const stabMod =
    stab >= 85 ? -2 :
    stab >= 70 ? -1 :
    stab >= 50 ? 0 :
    stab >= 35 ? +1 :
    +2;

  const riskMod =
    route.risk === "high" ? +3 :
    route.risk === "medium" ? +1 :
    0;

  const strat = String(state.tradeNetwork?.strategy || "balanced");
  const stratMod =
    strat === "conservative" ? -1 :
    strat === "aggressive" ? +2 :
    0;

  return clampInt(base + stabMod + riskMod + stratMod, 6, 20);
}

function routePayout(route, tier){
  const y = clampInt(route.yieldGP ?? 0, 0, 999999);
  if(tier === "critical_success") return clampInt(Math.floor(y * 1.25), 0, 999999);
  if(tier === "great_success")    return clampInt(Math.floor(y * 1.10), 0, 999999);
  if(tier === "success")          return y;
  if(tier === "failure")          return clampInt(Math.floor(y * 0.50), 0, 999999);
  return 0; // bad_failure / critical_failure
}

async function resolveTradeRoutesModal(){
  if(!state.tradeNetwork?.active){
    await openSIModal({
      title: "Ironbow Trade Network",
      bodyHtml: `<div class="small muted">No active Trade Consortium. Establish a Trade Consortium to open routes.</div>`,
      primaryText: "Close",
      modalClass: "siModal--hall"
    });
    return;
  }

  const routes = (state.tradeNetwork.routes || []).filter(r => r && r.status !== "removed");
  if(routes.length === 0){
    await openSIModal({
      title: "Ironbow Trade Network",
      bodyHtml: `<div class="small muted">No routes exist yet. Activate Trade Consortium targeting a clan to open a route.</div>`,
      primaryText: "Close",
      modalClass: "siModal--hall"
    });
    return;
  }

  let totalGained = 0;
  const narrativeLines = [];

  for(const r of routes){
    if(r.status === "disrupted"){
      narrativeLines.push(`${r.clan} route remains disrupted.`);
      continue;
    }

    const dc = routeDC(r);
    const mod = 0;

    const roll = await rollD20Manual({
      title: `Resolve Route: ${r.clan} (${r.commodity})`,
      mod,
      dc,
      modalClass: "siModal--hall"
    });
    if(!roll){
      log("Trade Network", "Route resolution cancelled.");
      saveState();
      render();
      return;
    }

    const tier = tierFromRoll(roll.d20, roll.total, dc);
    const payout = routePayout(r, tier);

    if(payout > 0){
      state.treasuryGP += payout;
      totalGained += payout;
      narrativeLines.push(`${r.clan} convoy makes port. +${payout} gp.`);
    } else {
      r.status = "disrupted";
      state.tradeNetwork.stability = clampInt((state.tradeNetwork.stability ?? 75) - (r.risk === "high" ? 8 : 5), 0, 100);
      narrativeLines.push(`${r.clan} route falters. Ships delayed. Stability drops.`);
      enqueueArbitrationDispute(r.clan, "Trade disruption and disputed tariffs.");
    }
  }

  saveState();
  render();

  await openSIModal({
    title: "Trade Routes Resolved",
    bodyHtml: `
      <div style="display:flex; gap:14px; align-items:center; margin-bottom:12px">
        <img src="assets/ui/trade_signing.png" style="width:140px; border-radius:14px; border:1px solid rgba(214,178,94,.25)" />
        <div>
          <div class="siResSummary"><b>Total Earned:</b> ${escapeHtml(String(totalGained))} gp</div>
          <div class="siResSummary" style="margin-top:8px"><b>Market Stability:</b> ${escapeHtml(String(state.tradeNetwork.stability ?? 75))}%</div>
        </div>
      </div>
      <ul class="siResList">
        ${narrativeLines.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}
      </ul>
    `,
    primaryText: "Continue",
    modalClass: "siModal--hall"
  });

  log("Trade Network", `Routes resolved. +${totalGained} gp. Stability ${state.tradeNetwork.stability ?? 75}%.`);
}
async function openTradeMapModal(){
  // Uses: assets/ui/clan_trading_locations.png
  const routes = (state.tradeNetwork?.routes || [])
    .filter(r => r && r.status !== "removed");

  const activeList = routes.length
    ? `<ul class="siResList">
        ${routes.map(r => {
          const status = r.status === "disrupted" ? "DISRUPTED" : "ACTIVE";
          const meta = `${r.commodity || "Goods"} • ${r.risk || "medium"} risk • ${clampInt(r.yieldGP ?? 0, 0, 999999)} gp/turn`;
          return `<li><b>${escapeHtml(String(r.clan || "Unknown"))}</b> — ${escapeHtml(status)} <span class="small muted">(${escapeHtml(meta)})</span></li>`;
        }).join("")}
      </ul>`
    : `<div class="small muted">No active routes yet. Create a Trade Consortium to open at least one route.</div>`;

  const clans = getActiveRouteClans();
  const overlaySvg = renderTradeRouteOverlaySvg(clans);

  await openSIModal({
    title: "Sea Trade Routes",
    bodyHtml: `
      <div class="tradeMapWrap">
        <img class="tradeMapImg"
             src="assets/ui/clan_trading_locations.png?v=2"
             alt="Clan Trading Locations" />
        ${overlaySvg}
      </div>

      <div class="small muted" style="margin-top:10px">
        Showing routes for: <b>${escapeHtml(clans.length ? clans.join(", ") : "none")}</b>
      </div>

      <div class="siResChanges" style="margin-top:14px">
        <div class="siResChangesTitle">Active Routes</div>
        ${activeList}
      </div>
    `,
    primaryText: "Close",
    modalClass: "siModal--hall"
  });
}

// =========================
// Arbitration (Dispute Queue)
// =========================

function pickRandomOtherClan(clanA){
  const list = ["Blackstone","Bacca","Farmer","Slade","Molten","Rowthorn","Karr"];
  const a = String(clanA||"").toLowerCase();
  const others = list.filter(x => x.toLowerCase() !== a);
  return others[Math.floor(Math.random()*others.length)];
}

function enqueueArbitrationDispute(clanA, reason){
  if(!state.arbitration || typeof state.arbitration !== "object"){
    state.arbitration = { queue: [], lastSpawnTurn: -1 };
  }
  if(!Array.isArray(state.arbitration.queue)) state.arbitration.queue = [];

  state.arbitration.queue.push({
    id: uid(),
    a: String(clanA || "Unknown"),
    b: pickRandomOtherClan(clanA),
    reason: String(reason || "A dispute over tariffs and cargo claims."),
    createdTurn: state.turn
  });

  saveState();
}

   function allBuiltFacilityIds(){
  const base = Array.isArray(state.builtFacilities) ? state.builtFacilities : [];
  const extra = Array.isArray(state.builtExtras) ? state.builtExtras : [];
  // unique
  return Array.from(new Set([...base, ...extra]));
}

   function renderPendingOrders(){
  const p = Array.isArray(state.pendingOrders) ? state.pendingOrders : [];
  if(!p.length){
    ui.pendingList.innerHTML = `<div class="small muted">No pending orders.</div>`;
    return;
  }
  ui.pendingList.innerHTML = p.map(o => `
    <div class="item">
      <div>
        <div class="item__name">${escapeHtml(o.label)}</div>
        <div class="item__meta">Completes on Turn ${escapeHtml(String(o.completeTurn))}</div>
      </div>
      <button class="item__btn" data-cancel="${escapeHtml(String(o.id))}">Cancel</button>
    </div>
  `).join("");

  ui.pendingList.querySelectorAll("[data-cancel]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-cancel");
      state.pendingOrders = state.pendingOrders.filter(x => String(x.id) !== String(id));
      saveState();
      log("Orders", "Cancelled an order.");
      render();
    });
  });
}

   function issueOrder(facId, fnId){
  const fac = DATA.facilities.find(f => f.id === facId);
  if(!fac) return;
  const fn = (fac.functions || []).find(x => x.id === fnId);
  if(!fn) return;

  // Prevent duplicate pending same facility+function
  if(state.pendingOrders.some(o => o.facId === facId && o.fnId === fnId)){
    alert("That order is already pending.");
    return;
  }

  // Resolve chosen option (same logic you already had)
  let chosen = null;
  let optionLabel = null;

  if(fn.options && fn.options.length){
    const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
    const idx = clampInt(sel ? sel.value : 0, 0);
    chosen = fn.options[idx] || null;
    optionLabel = chosen && chosen.label ? chosen.label : String(chosen || "");
  } else if(fac.id==="workshop" && fn.id==="craft"){
  const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
  const idx = clampInt(sel ? sel.value : 0, 0);

  const chosenTables = (state.artisanTools || []).filter(Boolean);
  const set = new Set();
  for(const t of chosenTables){
    for(const item of (DATA.tools[t] || [])) set.add(String(item));
  }
  const items = Array.from(set).sort((a,b)=>a.localeCompare(b));
  const picked = items[idx] || "";

  chosen = { label: picked, craftItem: picked };
  optionLabel = picked;
}

      let { costGP } = computeFnCost(fac, fn, chosen);

// Summit discount applies to Hall of Emissaries actions (except upgrades)
if(fac.id === "hall_of_emissaries" && fn.special?.type === "emissary_action"){
  const activeSummit = (state.diplomacy?.summits || [])[0];
  if(activeSummit && activeSummit.costReductionPct){
    const pct = clampInt(activeSummit.costReductionPct, 0, 90);
    costGP = Math.max(0, Math.floor(costGP * (100 - pct) / 100));
  }
}

  if(costGP > state.treasuryGP){
    alert(`Not enough gp. Need ${costGP}gp, you have ${state.treasuryGP}gp.`);
    return;
  }

  // Pay cost up front when order is issued
  state.treasuryGP -= costGP;

  const id = uid();
  const label = `${fac.name}: ${fn.label}${optionLabel ? ` (${optionLabel})` : ""}`;

  state.pendingOrders.push({
    id,
    facId,
    fnId,
    chosen,
    optionLabel,
    label,
    costGP,
    issuedTurn: state.turn,
    completeTurn: state.turn + 1
  });

  saveState();
  log("Order Issued", label);
  render();
}

   function issueOrderWithMeta(facId, fnId, optionIdxOverride, meta){
  const fac = DATA.facilities.find(f => f.id === facId);
  if(!fac) return;

  const fn = (fac.functions || []).find(x => x.id === fnId);
  if(!fn) return;

  if(state.pendingOrders.some(o => o.facId === facId && o.fnId === fnId)){
    alert("That order is already pending.");
    return;
  }

  let chosen = null;
  let optionLabel = null;

  // If the function has real options in facilities.json, use them
  if(fn.options && fn.options.length){
    const idx = clampInt(optionIdxOverride ?? 0, 0);
    chosen = fn.options[idx] || null;
    optionLabel = chosen && chosen.label ? chosen.label : String(chosen || "");
  } else {
    // If there are NO fn.options (e.g. Arbitration/Consortium), use meta.targetClan from the planning modal
    const t = (meta && typeof meta === "object") ? String(meta.targetClan || "") : "";
    if(t){
      optionLabel = t;
      chosen = { label: t };
    }
  }

  let { costGP } = computeFnCost(fac, fn, chosen);

  // Summit discount applies to Hall of Emissaries actions (except upgrades)
  if(fac.id === "hall_of_emissaries" && fn.special?.type === "emissary_action"){
    const activeSummit = (state.diplomacy?.summits || [])[0];
    if(activeSummit && activeSummit.costReductionPct){
      const pct = clampInt(activeSummit.costReductionPct, 0, 90);
      costGP = Math.max(0, Math.floor(costGP * (100 - pct) / 100));
    }
  }

  if(costGP > state.treasuryGP){
    alert(`Not enough gp. Need ${costGP}gp, you have ${state.treasuryGP}gp.`);
    return;
  }

  state.treasuryGP -= costGP;

  const id = uid();
  const label = `${fac.name}: ${fn.label}${optionLabel ? ` (${optionLabel})` : ""}`;

  state.pendingOrders.push({
    id,
    facId,
    fnId,
    chosen,
    optionLabel,
    label,
    costGP,
    issuedTurn: state.turn,
    completeTurn: state.turn + 1,
    meta: (meta && typeof meta === "object") ? meta : null
  });

  saveState();
  log("Order Issued", label);
  render();
}


   function toolTableNames(){
  return Object.keys(DATA.tools || {}).filter(k => k.endsWith("Tools") || k.endsWith("Supplies"));
}

function renderArtisanTools(){
  if(!ui.artisanToolGrid) return;

  const tables = toolTableNames();
  // ensure shape
  if(!Array.isArray(state.artisanTools)) state.artisanTools = ["","","","","",""];
  while(state.artisanTools.length < 6) state.artisanTools.push("");

  ui.artisanToolGrid.innerHTML = Array.from({length:6}, (_,i)=>{
    const current = state.artisanTools[i] || "";
    return `
      <label class="field">
        <span>Set ${i+1}</span>
        <select id="artisanSel_${i}">
          <option value="">(None)</option>
          ${tables.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select>
      </label>
    `;
  }).join("");

    for(let i=0;i<6;i++){
    const sel = document.getElementById(`artisanSel_${i}`);
    if(sel) sel.value = state.artisanTools[i] || "";
  }

  bindArtisanTooltips();
}

function readArtisanToolsFromUI(){
  if(!Array.isArray(state.artisanTools)) state.artisanTools = ["","","","","",""];
  for(let i=0;i<6;i++){
    const sel = document.getElementById(`artisanSel_${i}`);
    state.artisanTools[i] = sel ? (sel.value || "") : "";
  }
  saveState();
}
   function bindArtisanTooltips(){
  const tip = document.getElementById("artisanTooltip");
  if(!tip) return;

  // Avoid re-binding every render
  const selects = Array.from(document.querySelectorAll("#artisanToolGrid select"));
  for(const sel of selects){
    if(sel.dataset.ttBound === "1") continue;
    sel.dataset.ttBound = "1";

    const show = (e)=>{
      const table = sel.value;
      if(!table){
        tip.hidden = true;
        return;
      }
      const items = (DATA.tools && DATA.tools[table]) ? DATA.tools[table] : [];
      const preview = items.slice(0, 24); // keep it tidy

      tip.innerHTML = `
        <div class="ttTitle">${escapeHtml(table)}</div>
        ${items.length
          ? `<div class="small muted">Enables ${items.length} craftable item(s). Showing first ${preview.length}:</div>
             <ul>${preview.map(x=>`<li>${escapeHtml(String(x))}</li>`).join("")}</ul>`
          : `<div class="small muted">No items found for this tool table.</div>`
        }
      `;

      tip.hidden = false;
      positionTooltip(e, tip);
    };

    const move = (e)=> positionTooltip(e, tip);
    const hide = ()=> { tip.hidden = true; };

    sel.addEventListener("mouseenter", show);
    sel.addEventListener("mousemove", move);
    sel.addEventListener("mouseleave", hide);
    sel.addEventListener("change", show);
  }
}

function positionTooltip(e, tip){
  const pad = 14;
  const x = (e.clientX || 0) + pad;
  const y = (e.clientY || 0) + pad;

  // Keep on screen
  const maxX = window.innerWidth - (tip.offsetWidth || 420) - 18;
  const maxY = window.innerHeight - (tip.offsetHeight || 200) - 18;

  tip.style.left = `${Math.max(18, Math.min(x, maxX))}px`;
  tip.style.top  = `${Math.max(18, Math.min(y, maxY))}px`;
}

   function renderFacilities(){
  const lvl = state.partyLevel;

  // --- Slots UI (construction) ---
  normalizeBuiltExtras();

  const maxSlots = constructionSlotsForLevel(lvl);

  // Ensure builtExtras has exactly maxSlots entries
  while(state.builtExtras.length < maxSlots) state.builtExtras.push("");
  if(state.builtExtras.length > maxSlots) state.builtExtras = state.builtExtras.slice(0, maxSlots);

  // Meta text
  const used = state.builtExtras.filter(x => x && typeof x === "object" && x.facId).length;
  ui.slotMeta.textContent = `Level ${lvl} → ${maxSlots} slot(s). Used: ${used}/${maxSlots}`;

  ui.slotList.innerHTML = "";

  // Buildable facilities = everything except starters
  const buildable = DATA.facilities.filter(f => !STARTING_BUILT.includes(f.id));

  // Reserved = already built OR currently building in any slot + starters
  const reserved = reservedFacilityIds();

  // Build each slot row
  for(let slotIndex = 0; slotIndex < maxSlots; slotIndex++){
    const current = state.builtExtras[slotIndex];

    const row = document.createElement("div");
    row.className = "slotRow";

    // If slot occupied (building or built), show locked label
    if(current && typeof current === "object" && current.facId){
      const fac = DATA.facilities.find(f=>f.id===current.facId);
      const name = fac ? fac.name : current.facId;

      const statusText = (current.status === "building")
        ? `Under construction • ${Number(current.remaining||0)} turn(s) remaining`
        : `Built • Active`;

      row.innerHTML = `
        <div class="slotLocked">
          <div class="slotLocked__name">${escapeHtml(name)}</div>
          <div class="small muted">${escapeHtml(statusText)}</div>
        </div>
      `;
      ui.slotList.appendChild(row);
      continue;
    }

    // Empty slot: dropdown + build button
    const optionsHtml = buildable.map(f=>{
      const isTaken = reserved.includes(f.id);
      const req = Number(f.requiredLevel || 0);
      const isLockedByLevel = lvl < req;
      const disabled = isTaken || isLockedByLevel;

      const lockLabel = isLockedByLevel ? ` (Locked: Lvl ${req})` : "";
      const takenLabel = isTaken ? " (Already chosen)" : "";

      return `<option value="${escapeHtml(f.id)}" ${disabled ? "disabled" : ""}>
        ${escapeHtml(f.name)}${escapeHtml(lockLabel)}${escapeHtml(takenLabel)}
      </option>`;
    }).join("");

    row.innerHTML = `
      <select id="slot_${slotIndex}">
        <option value="">(Empty slot)</option>
        ${optionsHtml}
      </select>
      <button class="btn btn--small" data-slot="${slotIndex}">Build</button>
    `;

    ui.slotList.appendChild(row);
  }

  // Slot Build button wiring
  ui.slotList.querySelectorAll("button[data-slot]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const slotIndex = clampInt(btn.getAttribute("data-slot"), 0);
      const sel = document.getElementById(`slot_${slotIndex}`);
      const val = sel ? sel.value : "";

      if(!val) return;

      const fac = DATA.facilities.find(f=>f.id===val);
      const req = Number(fac?.requiredLevel || 0);

      // Level gate (hard enforcement)
      if(lvl < req){
        alert(`Locked. ${fac?.name || val} requires party level ${req}.`);
        return;
      }

      // Duplicate prevention (built OR building)
      if(reservedFacilityIds().includes(val)){
        alert("That facility is already built or under construction.");
        return;
      }

      const turns = buildTurnsForRequiredLevel(req);

      if(turns <= 0){
        state.builtExtras[slotIndex] = { facId: val, status: "built" };
        log("Construction", `${fac?.name || val} built instantly.`);
      }else{
        state.builtExtras[slotIndex] = { facId: val, status: "building", remaining: turns };
        log("Construction Started", `${fac?.name || val} is under construction (${turns} turns).`);
      }

      saveState();
      render();
    });
  });

  // --- Pending Orders list ---
  renderPendingOrders();

  // --- Facilities grid: ONLY built facilities ---
  const builtIds = builtFacilityIds();
  const builtFacilities = DATA.facilities.filter(f => builtIds.includes(f.id) && f.id !== "hall_of_emissaries");

  ui.facilitiesGrid.innerHTML = builtFacilities.map(fac => {
    const fns = (fac.functions || []).map(fn => {
  const facLvl = getFacilityLevel(fac.id);
  const req = clampInt(fn.requiredFacilityLevel ?? 1, 1, 3);
  const locked = facLvl < req;
  return renderFunction(fac, fn, locked);
}).join("");

    const imgFile = FACILITY_IMG[fac.id];
    const imgHtml = imgFile
      ? `<div class="facImgWrap"><img class="facImg" src="${withBase(`assets/facilities/${imgFile}`)}" alt="${escapeHtml(fac.name)}" /></div>`
      : "";

    return `
      <div class="fac">
        ${imgHtml}
        <div class="facTop">
          <div>
            <div class="facName">${escapeHtml(fac.name)}</div>
            <div class="small muted">Built • Functions take 1 Bastion Turn</div>
          </div>
          <div class="facMeta"><span class="tag tag--ok">Active</span></div>
        </div>
        <div class="facFns">${fns || `<div class="small muted">No functions listed.</div>`}</div>
      </div>
    `;
  }).join("");

  // attach events to function buttons
  ui.facilitiesGrid.querySelectorAll("[data-action='runFn']").forEach(btn => {
    btn.addEventListener("click", () => {
      const facId = btn.getAttribute("data-fac");
      const fnId = btn.getAttribute("data-fn");
      issueOrder(facId, fnId);
    });
  });
}


  function renderFunction(fac, fn, locked){
    const key = `${fac.id}__${fn.id}`;
    const needsOption = (fn.options && fn.options.length>0);
         // NEW: Hall of Emissaries cooldown UX (disable Issue Order during cooldown)
    let cooldownLeft = 0;
    if(fac.id === "hall_of_emissaries" && fn.special && fn.special.type === "emissary_action"){
      cooldownLeft = diplomacyCooldownTurnsLeft(String(fn.special.kind || ""));
    }

    const isDisabled = locked || (cooldownLeft > 0);
    const btnText = cooldownLeft > 0 ? `Cooldown: ${cooldownLeft} turn${cooldownLeft===1?"":"s"}` : "Issue Order";

    // Workshop's Craft function is special: it depends on "tools installed".
    // For MVP we let the DM pick ANY tool list from the spreadsheet tables.
    let options = fn.options || [];
    if(fac.id === "workshop" && fn.id === "craft"){
  // Build craftable items from the saved Artisan Tools selections
  const chosenTables = (state.artisanTools || []).filter(Boolean);
  const set = new Set();

  for(const t of chosenTables){
    const list = DATA.tools[t] || [];
    for(const item of list){
      set.add(String(item));
    }
  }

  const items = Array.from(set).sort((a,b)=>a.localeCompare(b));
  options = items.map(name => ({ label: name, craftItem: name }));
}

    const selectHtml = needsOption || (fac.id==="workshop" && fn.id==="craft")
      ? `<select id="sel_${escapeHtml(key)}">
          ${(options || []).map((o,idx)=>{
            const label = o.label || o;
            const cost = (o.costGP!=null) ? ` (${o.costGP}gp)` : "";
            return `<option value="${idx}">${escapeHtml(label)}${escapeHtml(cost)}</option>`;
          }).join("")}
        </select>`
      : "";

    const costText = computeFnCostText(fac, fn, null);

    const notes = (fac.id==="workshop" && fn.id==="craft") ? "" : (fn.notes ? `<div class="fnNotes">${escapeHtml(fn.notes)}</div>` : "");

    return `
      <div class="fnRow">
        <div class="fnHeader">
          <div class="fnName">${escapeHtml(fn.label)}</div>
          <div class="fnCost" id="cost_${escapeHtml(key)}">${escapeHtml(costText)}</div>
        </div>
        ${selectHtml}
        <button class="btn btn--small" data-action="runFn" data-fac="${escapeHtml(fac.id)}" data-fn="${escapeHtml(fn.id)}" ${isDisabled ? "disabled" : ""}>
  ${escapeHtml(btnText)}
</button>
        ${notes}
      </div>
    `;
  }

  // ---------- Actions ----------
  function runFacilityFunction(facId, fnId){
    const fac = DATA.facilities.find(f => f.id === facId);
    if(!fac) return;
    const fn = (fac.functions || []).find(x => x.id === fnId);
    if(!fn) return;

    // Resolve option
    let chosen = null;
    if(fn.options && fn.options.length){
      const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
      const idx = clampInt(sel ? sel.value : 0, 0);
      chosen = fn.options[idx] || null;
    } else if(fac.id==="workshop" && fn.id==="craft"){
      const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
      const idx = clampInt(sel ? sel.value : 0, 0);
      const toolTables = Object.keys(DATA.tools || {}).filter(k => k.endsWith("Tools") || k.endsWith("Supplies"));
      const tableName = toolTables[idx];
      chosen = { label: tableName, toolTable: tableName };
    }

    const { costGP, costText } = computeFnCost(fac, fn, chosen);

    if(costGP > state.treasuryGP){
      alert(`Not enough gp. Need ${costGP}gp, you have ${state.treasuryGP}gp.`);
      return;
    }

    // Pay cost
    state.treasuryGP -= costGP;

    // Apply effects (simple, DM-friendly)
    const label = `${fac.name}: ${fn.label}`;
    const optionLabel = chosen && chosen.label ? chosen.label : null;

    // Special: Barracks recruit defenders
    if(fac.id==="barracks" && fn.id==="recruit_defenders"){
      const r = d(4);
      state.defenders.count += r;
      log(label, `Recruited ${r} defenders.`);
      saveState(); render(); return;
    }

    // Special: Watchtower patrol buff
    if(fac.id==="watchtower" && fn.id==="patrol"){
      state.defenders.patrolAdvantage = true;
      log(label, "Patrol active. Defenders have Advantage on bastion defense rolls until the next turn advance.");
      saveState(); render(); return;
    }

    // Special: Armoury arm defenders (dynamic cost)
    if(fac.id==="armoury" && fn.id==="arm_defenders"){
      state.defenders.armed = (state.defenders.count > 0);
      log(label, `Armed defenders. Cost paid: ${costGP}gp.`);
      saveState(); render(); return;
    }

    // War Room recruit -> military list
    if(fac.id==="war_room" && fn.id==="recruit"){
      const unit = optionLabel || "Unit";
      addToList(state.military, unit, { source: "War Room" });
      log(label, `Recruited: ${unit}.`);
      saveState(); render(); return;
    }

    // Menagerie recruit -> defenders roster as items
    if(fac.id==="menagerie" && fn.id==="recruit_beast"){
      const beast = optionLabel || "Beast";
      addToList(state.military, beast, { source: "Menagerie" });
      log(label, `Recruited beast: ${beast}.`);
      saveState(); render(); return;
    }

    // Dock charter -> warehouse
    if(fac.id==="dock" && fn.id==="charter_berth"){
      appendToWarehouse(optionLabel || "Chartered vessel", 1, "", "Dock");
      log(label, optionLabel ? `Chartered: ${optionLabel}.` : "Chartered a vessel.");
      saveState(); render(); return;
    }

    // Craft / Harvest / Trade -> warehouse
    if(["arcane_study","sanctuary","garden","greenhouse","laboratory","scriptorium","library","smithy","storehouse","gaming_hall","workshop"].includes(fac.id)){
      if(fac.id==="workshop" && fn.id==="craft" && chosen && chosen.toolTable){
        // pick an item from that tool table at random
        const list = DATA.tools[chosen.toolTable] || [];
        if(list.length){
          const item = list[Math.floor(Math.random()*list.length)];
          appendToWarehouse(item, 1, "", chosen.toolTable);
          log(label, `Crafted: ${item} (from ${chosen.toolTable}).`);
        }else{
          log(label, `No items found for table: ${chosen.toolTable}.`);
        }
        saveState(); render(); return;
      }

      if(optionLabel){
        appendToWarehouse(optionLabel, 1, "", fac.name);
        log(label, `Added to warehouse: ${optionLabel}.`);
      }else{
        log(label, "Completed.");
      }
      saveState(); render(); return;
    }

    // Default
    log(label, optionLabel ? `Completed: ${optionLabel}.` : "Completed.");
    saveState();
    render();
  }

  function computeFnCost(fac, fn, chosen){
    // Dynamic: Armoury 'Arm Defenders'
    if(fac.id==="armoury" && fn.id==="arm_defenders"){
      const base = 100;
      const per = 100;
      const dyn = base + (state.defenders.count * per);
      return { costGP: dyn, costText: `${dyn}gp (100 + defenders×100)` };
    }

    // Options with costs
    if(chosen && chosen.costGP != null){
      return { costGP: Number(chosen.costGP) || 0, costText: `${Number(chosen.costGP) || 0}gp` };
    }

    // Fixed cost on function
    if(fn.costGP != null){
      return { costGP: Number(fn.costGP) || 0, costText: `${Number(fn.costGP)||0}gp` };
    }

    // Text-only cost (unparsed)
    if(fn.costText){
      // Try parse first integer
      const m = String(fn.costText).replace(/,/g,"").match(/(\d+)/);
      const gp = m ? Number(m[1]) : 0;
      return { costGP: gp, costText: fn.costText };
    }

    return { costGP: 0, costText: "0gp" };
  }

  function computeFnCostText(fac, fn){
    const { costText } = computeFnCost(fac, fn, null);
    return costText || "0gp";
  }

  // ---------- Events ----------
  function resolveEvent(roll, table){
    for(const row of (table||[])){
      const [a,b] = String(row.range).split("-").map(x=>parseInt(x,10));
      const min = isNaN(a) ? 1 : a;
      const max = isNaN(b) ? min : b;
      if(roll>=min && roll<=max) return row;
    }
    return { range: "??", name: "Unknown" };
  }

  // ---------- State ----------
  function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);

  // Defaults (first ever load)
  const DEFAULT_STATE = {
    treasuryGP: 0,
    partyLevel: 7,

    // starting built facilities (your requested 5)
    builtFacilities: ["barracks","armoury","watchtower","workshop","dock"],
    builtExtras: [],

    // 1-turn pending orders
    pendingOrders: [],

    // defenders core + menagerie beasts
    defenders: { count:0, armed:false, patrolAdvantage:false },
    defenderBeasts: [],

    // lists
    military: [],
    warehouse: [],

    // artisan tool selections (6 dropdowns)
    artisanTools: ["","","","","",""],

    // Favour of The Gods (0-100 per god)
    favour: { telluria: 0, aurush: 0, pelagos: 0 },
         // Political Capital per clan (-100..+100)
    politicalCapital: {
      blackstone: 0,
      bacca: 0,
      farmer: 0,
      slade: 0,
      molten: 0,
      rowthorn: 0,
      karr: 0
    },

       tradeNetwork: {
    active: false,
    strategy: "balanced",     // conservative | balanced | aggressive
    stability: 75,            // 0..100 market stability
    routes: [],               // [{ id, clan, commodity, risk, yieldGP, stabilityDC, status }]
    lastResolvedTurn: -1,
    recruitmentBoostTurns: 0
  },

  arbitration: {
    queue: [],                // disputes waiting to resolve
    lastSpawnTurn: -1
  },

    // turns + events + log
    turn: 1,
    lastEvent: null,
    log: [],
  };

  if(!raw) return DEFAULT_STATE;

  try{
    const s = JSON.parse(raw);

    // Merge saved state into defaults safely
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

      tradeNetwork: (s.tradeNetwork && typeof s.tradeNetwork === "object") ? s.tradeNetwork : {
        active:false, strategy:"balanced", stability:75, routes:[], lastResolvedTurn:-1, recruitmentBoostTurns:0
      },

      arbitration: (s.arbitration && typeof s.arbitration === "object") ? s.arbitration : {
        queue:[], lastSpawnTurn:-1
      },

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

  function log(title, body){
    state.log.unshift({ title, body, at: Date.now() });
  }

  function renderLog(){
    if(!state.log.length){
      ui.logList.innerHTML = `<div class="small muted">No log entries yet.</div>`;
      return;
    }
    ui.logList.innerHTML = state.log.slice(0, 80).map(e => `
      <div class="logEntry">
        <div class="logEntry__top">
          <div class="logEntry__title">${escapeHtml(e.title)}</div>
          <div class="logEntry__time">${escapeHtml(formatTime(e.at))}</div>
        </div>
        <div class="logEntry__body">${escapeHtml(e.body || "")}</div>
      </div>
    `).join("");
  }

  function addToList(list, name, meta={}){
    // Merge duplicates by name
    const idx = list.findIndex(x => x.name === name);
    if(idx>=0){
      list[idx].qty = (list[idx].qty || 1) + 1;
      list[idx].source = meta.source || list[idx].source;
    }else{
      list.push({ name, qty: 1, source: meta.source || "" });
    }
  }

  function ensureFavourShape(){
  if(!state.favour || typeof state.favour !== "object"){
    state.favour = { telluria: 0, aurush: 0, pelagos: 0 };
  }
  for(const k of ["telluria","aurush","pelagos"]){
    state.favour[k] = clampInt(state.favour[k] ?? 0, 0, 100);
  }
}

function renderFavour(){
  ensureFavourShape();

  const panel = document.getElementById("favourPanel");
  if(!panel) return;

  for(const god of ["telluria","aurush","pelagos"]){
    const v = clampInt(state.favour[god] ?? 0, 0, 100);
    const fill = document.getElementById(`favourFill_${god}`);
    const pct  = document.getElementById(`favourPct_${god}`);
    const btn  = document.getElementById(`favourClaim_${god}`);

    if(fill) fill.style.width = `${v}%`;
    if(pct) pct.textContent = `${v}%`;

    const isFull = v >= 100;
    if(btn) btn.hidden = !isFull;
  }
}

function bindFavourButtonsOnce(){
  for(const god of ["telluria","aurush","pelagos"]){
    const btn = document.getElementById(`favourClaim_${god}`);
    if(!btn) continue;
    if(btn.dataset.bound === "1") continue;
    btn.dataset.bound = "1";

    btn.addEventListener("click", ()=>{
      ensureFavourShape();
      state.favour[god] = 0;
      saveState();
      log("Favour Claimed", `${god.toUpperCase()} favour claimed. Bar reset to 0%.`);
      render();
    });
  }
}

function addFavourPercent(god, amount){
  ensureFavourShape();
  const g = String(god || "").toLowerCase();
  if(!["telluria","aurush","pelagos"].includes(g)) return;

  const add = clampInt(amount ?? 0, 0, 100);
  state.favour[g] = clampInt((state.favour[g] ?? 0) + add, 0, 100);
  saveState();
  renderFavour();
}

   // =========================
// Political Capital (Clans)
// =========================

function ensurePoliticalCapitalShape(){
  if(!state.politicalCapital || typeof state.politicalCapital !== "object"){
    state.politicalCapital = {
      blackstone: 0, bacca: 0, farmer: 0, slade: 0, molten: 0, rowthorn: 0, karr: 0
    };
  }
  for(const k of ["blackstone","bacca","farmer","slade","molten","rowthorn","karr"]){
    state.politicalCapital[k] = clampInt(state.politicalCapital[k] ?? 0, -100, 100);
  }
}

function clanIdFromLabel(label){
  const raw = String(label || "").toLowerCase().trim();
  const s = raw.replace(/^clan\s+/, "").replace(/\s+/g, " ");
  const map = {
    "blackstone":"blackstone",
    "bacca":"bacca",
    "farmer":"farmer",
    "slade":"slade",
    "molten":"molten",
    "rowthorn":"rowthorn",
    "karr":"karr",
  };
  return map[s] || null;
}

function addPoliticalCapital(clanLabel, delta){
  ensurePoliticalCapitalShape();
  const id = clanIdFromLabel(clanLabel);
  if(!id) return;
  state.politicalCapital[id] = clampInt((state.politicalCapital[id] ?? 0) + clampInt(delta, -100, 100), -100, 100);
  saveState();
  renderPoliticalCapital();
}

function renderPoliticalCapital(){
  ensurePoliticalCapitalShape();

  for(const id of ["blackstone","bacca","farmer","slade","molten","rowthorn","karr"]){
    const v = clampInt(state.politicalCapital[id] ?? 0, -100, 100);

    const fill = document.getElementById(`pcFill_${id}`);
    const val  = document.getElementById(`pcVal_${id}`);
    const btn  = document.getElementById(`pcClaim_${id}`);

    if(val) val.textContent = String(v);

    // Convert -100..+100 into a bar that grows left or right from the center.
    // Bar width is 100% total, so each side is 50%.
    const pct = Math.min(100, Math.abs(v));        // 0..100
    const sideWidth = (pct / 100) * 50;           // 0..50

    if(fill){
      if(v >= 0){
        fill.style.left = "50%";
        fill.style.width = `${sideWidth}%`;
      } else {
        fill.style.left = `${50 - sideWidth}%`;
        fill.style.width = `${sideWidth}%`;
      }
    }

    const atExtreme = Math.abs(v) >= 100;
    if(btn) btn.hidden = !atExtreme;
  }
}

function renderDiplomaticAssets(){
  ensureDiplomacyState();
  const pill = document.getElementById("daTokensPill");
  if(!pill) return;
  pill.textContent = String(clampInt(state.diplomacy.tokens ?? 0, 0, 999));
}

function bindPoliticalButtonsOnce(){
  for(const id of ["blackstone","bacca","farmer","slade","molten","rowthorn","karr"]){
    const btn = document.getElementById(`pcClaim_${id}`);
    if(!btn) continue;
    if(btn.dataset.bound === "1") continue;
    btn.dataset.bound = "1";

    btn.addEventListener("click", ()=>{
      ensurePoliticalCapitalShape();
      state.politicalCapital[id] = 0;
      saveState();
      log("Honour Change", `Honour Change prompted for Clan ${id.toUpperCase()}. Political Capital reset to neutral.`);
      render();
    });
  }
}
 
  // ---------- Utils ----------
  function d(sides){ return 1 + Math.floor(Math.random()*sides); }

  function clampInt(v, min, max){
    const n = parseInt(String(v), 10);
    const x = isNaN(n) ? (min ?? 0) : n;
    if(max!=null) return Math.max(min ?? 0, Math.min(max, x));
    return Math.max(min ?? 0, x);
  }

  function formatTime(ms){
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
