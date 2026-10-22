/* World Hunter MVP. No account or location tracking backend. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "worldHunterStateV1";
  const DEFAULT_RADIUS = 100;
  const VISIT_RADIUS = 35;
  const icons = {History:"🏛️",Architecture:"🏰",People:"🧭",Nature:"🌿",Science:"⚗️",Legend:"🌙",Place:"📍"};
  const demoCards = [
    {id:"demo-pompeii",title:"Pompeii: a city paused in time",category:"History",lat:40.7506,lon:14.4869,story:"In AD 79, Mount Vesuvius erupted and buried Pompeii under volcanic material. The deposits preserved buildings, objects and traces of everyday Roman life, giving archaeologists an extraordinary snapshot of an ancient city. This is a demo card, not a nearby GPS result.",source:"UNESCO World Heritage Centre",url:"https://whc.unesco.org/en/list/829/",kind:"documented",demo:true,art:"🏛️",rarity:"Uncommon"},
    {id:"demo-sorrento",title:"Sorrento and the sirens",category:"Legend",lat:40.6263,lon:14.3758,story:"In Greek mythology, sirens sang so beautifully that sailors were tempted towards danger. Later traditions linked sirens with parts of southern Italy's coastline. The exact locations vary across tellings, and the story belongs to mythology rather than verified local history. This is a demo card, not a nearby GPS result.",source:"Encyclopaedia Britannica — Siren",url:"https://www.britannica.com/topic/Siren-Greek-mythology",kind:"legend",demo:true,art:"🧜",rarity:"Rare"},
    {id:"demo-pantheon",title:"The Pantheon's giant concrete dome",category:"Architecture",lat:41.8986,lon:12.4769,story:"Rome's Pantheon has one of the world's most famous unreinforced concrete domes. Its builders used lighter materials higher up and a circular opening called an oculus at the top. The oculus also lets daylight—and rain—into the building. This is a demo card, not a nearby GPS result.",source:"Encyclopaedia Britannica — Pantheon",url:"https://www.britannica.com/topic/Pantheon-building-Rome-Italy",kind:"documented",demo:true,art:"🏛️",rarity:"Rare"}
  ];

  let state = loadState();
  let discoveries = [...demoCards];
  let curatedCards = [];
  let curatedQuizzes = [];
  let sourceById = {};
  let map = null, userMarker = null, layer = null, watchId = null, userPosition = null, fogSvg = null, fogPath = null;
  let deferredInstall = null, activeCardId = null, toastTimer = null;
  let quizIndex = 0, quizScore = 0, quizAnswered = false, quizAnswers = [], quizStartedAt = null;
  let localQuizCard = null, localQuizAnswer = null;
  let acquisitionCircle = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {collected:Array.isArray(saved.collected)?saved.collected:[], radius:Number.isFinite(saved.radius)&&saved.radius>=10&&saved.radius<=5000?saved.radius:DEFAULT_RADIUS,
        visited:Array.isArray(saved.visited)?saved.visited:[], explored:Array.isArray(saved.explored)?saved.explored.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)):[], quizHistory:Array.isArray(saved.quizHistory)?saved.quizHistory:[], latestQuiz:saved.latestQuiz&&typeof saved.latestQuiz==="object"?saved.latestQuiz:null, localQuizBest:Number.isFinite(saved.localQuizBest)?saved.localQuizBest:null,
        autoCollect:saved.autoCollect !== false, observeDone:!!saved.observeDone, quizBestScore:Number.isFinite(saved.quizBestScore)?saved.quizBestScore:null, quizAttempts:Number.isFinite(saved.quizAttempts)?saved.quizAttempts:0, quizCompleted:!!saved.quizCompleted, locationSetupComplete:!!saved.locationSetupComplete, locationIntroDismissed:!!saved.locationIntroDismissed, profile:saved.profile || "Explorer"};
    } catch { return {collected:[],radius:DEFAULT_RADIUS,visited:[],explored:[],quizHistory:[],latestQuiz:null,localQuizBest:null,autoCollect:true,observeDone:false,quizBestScore:null,quizAttempts:0,quizCompleted:false,locationSetupComplete:false,locationIntroDismissed:false,profile:"Explorer"}; }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { toast("Couldn't save locally. Check browser storage settings."); }
    renderCounts(); renderJournal(); renderMissions();
  }
  function toast(message) {
    const el=$("toast"); el.textContent=message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3000);
  }
  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function distanceMetres(a,b) {
    const R=6371000, rad=x=>x*Math.PI/180, dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  function fmtDistance(m) { return m < 1000 ? `${Math.round(m)} m away` : `${(m/1000).toFixed(1)} km away`; }
  function collected(id) { return state.collected.some(x=>x.id===id); }
  function isDemo(c) { return !!c.demo; }
  function uniqueId(c) { return c.id || `${c.title}-${c.lat}-${c.lon}`; }

  async function loadCuratedContent() {
    try {
      const base = "./content/";
      const files = ["cards.json", "quizzes.json", "sources.json", "review_queue.json"];
      const loaded = await Promise.all(files.map(async file => {
        const response = await fetch(base + file);
        if (!response.ok) throw new Error(`Failed to load ${file}`);
        return response.json();
      }));
      const [cardsData, quizzesData, sourcesData, reviewData] = loaded;
      sourceById = Object.fromEntries((sourcesData.sources || []).map(source => [source.id, source]));
      const sourceCardData = cardsData.cards || [];
      curatedCards = sourceCardData.map(card => {
        const tags = card.category || [];
        const category = tags.some(x => /myth|folklore|legend/i.test(x)) ? "Legend"
          : tags.some(x => /nature|geology/i.test(x)) ? "Nature"
          : tags.some(x => /architecture|visual-observation/i.test(x)) ? "Architecture"
          : tags.some(x => /history|archaeology/i.test(x)) ? "History" : "Place";
        const firstSource = sourceById[(card.sources || [])[0]];
        return {
          id: card.id, title: card.title, category, short: card.short_story, story: card.short_story,
          kind: category === "Legend" ? "legend" : "documented", curated: true, status: card.status,
          locationName: card.location_name, locationArea: card.location_area,
          approvedFacts: card.approved_facts || [], visitChallenge: card.visit_challenge || null,
          sourceIds: card.sources || [], source: firstSource ? firstSource.title : "Curated content source",
          url: firstSource ? firstSource.url : "", coordinateStatus: card.coordinate_status || "needs_verified_geocoding",
          lat: card.coordinate_status === "verified_target" && Number.isFinite(card.lat) ? card.lat : null, lon: card.coordinate_status === "verified_target" && Number.isFinite(card.lon) ? card.lon : null, art: category === "Legend" ? "🌙" : category === "Nature" ? "🌿" : category === "Architecture" ? "🏛️" : "📚",
          rarity: card.status === "approved-with-limits" ? "Observation only" : "Curated story"
        };
      });
      const cardById = Object.fromEntries(sourceCardData.map(card => [card.id, card]));
      curatedQuizzes = (quizzesData.quizzes || []).filter(q => {
        const card = cardById[q.card_id];
        return q.status === "approved" && card && card.status === "approved" &&
          (card.approved_facts || []).some(f => f.id === q.fact_id) &&
          (q.source_ids || []).length > 0 && q.source_ids.every(id => !!sourceById[id]);
      }).map(q => ({
        id: q.id, cardId: q.card_id, factId: q.fact_id, q: q.question,
        options: q.options, answer: q.correct_option_index, explanation: q.explanation,
        sourceIds: q.source_ids
      }));
      discoveries = [...demoCards, ...curatedCards];
      if (curatedQuizzes.length) quizQuestions = curatedQuizzes;
      window.worldHunterContentStatus = {cards: curatedCards.length, approvedQuizzes: curatedQuizzes.length, reviewItems: (reviewData.items || []).length};
      renderDiscoveries(); renderLocalQuizPicker(); renderMissions();
      $("dataNote").textContent = `Sorrento content loaded: ${curatedCards.length} curated cards and ${curatedQuizzes.length} source-linked quiz questions. Only reviewed safe target points can be collected; other cards remain browse-only while their arrival points are checked.`;
    } catch (error) {
      console.warn("Curated content could not be loaded:", error);
      $("dataNote").textContent = "Curated content could not be loaded. Check that the content folder is deployed with the app.";
    }
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    ["explore","journal","missions"].forEach(name=>$(name+"Panel").hidden=name!==tab);
    if (tab==="explore" && map) setTimeout(()=>map.invalidateSize(),80);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));

  function rememberExploredPosition(position) {
    if(!Number.isFinite(position.lat)||!Number.isFinite(position.lon))return;state.explored=Array.isArray(state.explored)?state.explored:[];const last=state.explored[state.explored.length-1];
    if(last&&distanceMetres(last,position)<Math.max(20,state.radius*0.5))return;state.explored.push({lat:position.lat,lon:position.lon,at:Date.now()});if(state.explored.length>500)state.explored=state.explored.slice(-500);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{toast("Exploration area could not be saved on this device.");}
  }
  function renderFogOfWar() {
    if(!map||!fogSvg||!fogPath||!window.L)return;
    const size=map.getSize();fogSvg.setAttribute('width',size.x);fogSvg.setAttribute('height',size.y);fogSvg.setAttribute('viewBox','0 0 '+size.x+' '+size.y);
    let path='M0 0H'+size.x+'V'+size.y+'H0Z';
    (state.explored||[]).forEach(point=>{const centre=map.latLngToContainerPoint([point.lat,point.lon]);const onePixel=map.containerPointToLatLng([centre.x+1,centre.y]);const metresPerPixel=map.distance([point.lat,point.lon],onePixel);const radiusPx=Math.max(18,Math.min(180,55/Math.max(.01,metresPerPixel)));path+=' M '+(centre.x-radiusPx)+' '+centre.y+' a '+radiusPx+' '+radiusPx+' 0 1 0 '+(radiusPx*2)+' 0 a '+radiusPx+' '+radiusPx+' 0 1 0 '+(-radiusPx*2)+' 0';});
    fogPath.setAttribute('d',path);fogPath.setAttribute('fill-rule','evenodd');
  }
  function ensureMap(lat,lon) {
    if (!window.L) {
      $("dataNote").textContent="The map library could not load. Discovery cards and the journal still work; try again with an internet connection.";
      return;
    }
    if (!map) {
      $("map").innerHTML="";
      map=L.map("map",{zoomControl:true,scrollWheelZoom:true}).setView([lat,lon],16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);
      layer=L.layerGroup().addTo(map);window.worldHunterExploredLayer=L.layerGroup().addTo(map);
      const fogPane=map.createPane('worldHunterFogPane');fogPane.style.zIndex='350';fogPane.style.pointerEvents='none';fogSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');fogSvg.setAttribute('class','world-hunter-fog');fogSvg.style.position='absolute';fogSvg.style.left='0';fogSvg.style.top='0';fogSvg.style.pointerEvents='none';fogPath=document.createElementNS('http://www.w3.org/2000/svg','path');fogPath.setAttribute('fill','#172923');fogPath.setAttribute('fill-opacity','0.48');fogPane.appendChild(fogSvg);fogSvg.appendChild(fogPath);map.on('move zoom resize',renderFogOfWar);
    } else { map.setView([lat,lon],16); }
    if (acquisitionCircle) acquisitionCircle.remove();
    if(window.worldHunterExploredLayer){window.worldHunterExploredLayer.clearLayers();(state.explored||[]).forEach(point=>L.circle([point.lat,point.lon],{radius:Math.max(20,state.radius*1.5),color:"#8a9e73",weight:1,fillColor:"#c7d8b4",fillOpacity:.20,dashArray:"3 5",interactive:false}).addTo(window.worldHunterExploredLayer));}renderFogOfWar();
    acquisitionCircle=L.circle([lat,lon],{radius:state.radius,color:"#24574b",weight:2,fillColor:"#24574b",fillOpacity:.07,dashArray:"5 6"}).addTo(map);
    frameMapToRange();
    if (userMarker) userMarker.remove();
    userMarker=L.marker([lat,lon],{icon:L.divIcon({className:"explorer-location-marker",html:"<span class=\"explorer-marker-halo\"><img src=\"./assets/explorer-avatar.png\" alt=\"You are here\"></span>",iconSize:[54,62],iconAnchor:[27,55]})}).addTo(map).bindPopup("<b>You are here</b><br>Your location stays on this device.");
    renderMapMarkers();
    setTimeout(()=>{map.invalidateSize();frameMapToRange();},100);
  }
  function frameMapToRange() {
    if(!map||!userPosition||!window.L)return;
    const viewCircle=L.circle([userPosition.lat,userPosition.lon],{radius:state.radius*3});
    map.fitBounds(viewCircle.getBounds(),{padding:[18,18],maxZoom:17,animate:false});
    if(acquisitionCircle)acquisitionCircle.setRadius(state.radius);
    $("mapRadiusLabel").textContent=`Map view: ${(state.radius*3)>=1000?((state.radius*3/1000).toFixed(1)+" km"):((state.radius*3)+" m")} radius`;
  }
  function renderMapMarkers() {
    if (!map || !layer) return;
    layer.clearLayers();
    discoveries.filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lon)).forEach(c=>{
      const was=collected(c.id), near=userPosition?distanceMetres(userPosition,c)<=state.radius:false;
      const marker=L.marker([c.lat,c.lon],{icon:L.divIcon({className:"treasure-marker-wrap",html:`<span class="treasure-marker ${was?"is-collected":near?"is-near":""}" aria-hidden="true"><i>${was?"✓":"✦"}</i></span>`,iconSize:[40,48],iconAnchor:[20,43]})});
      marker.bindPopup(`<b>${escapeHtml(c.title)}</b><br>${was?"Collected":near?"Within unlock radius":"Verified target"}<br><button type="button" onclick="window.worldHunterOpen('${escapeHtml(c.id)}')">Open story</button>`);
      marker.on("click",()=>{});
      marker.addTo(layer);
    });
  }
  window.worldHunterOpen = id => { const c=discoveries.find(x=>x.id===id); if(c) openCard(c); };

  function renderDiscoveries() {
    const filter=$("categoryFilter").value;
    const list=$("discoveryList");
    let items=discoveries.filter(c=>filter==="all"||c.category===filter);
    if(userPosition) items.sort((a,b)=>(distanceMetres(userPosition,a)-distanceMetres(userPosition,b)));
    list.innerHTML="";
    if(!items.length){list.innerHTML='<div class="empty-state"><span>🧭</span><h3>No cards in this topic yet</h3><p>Try another topic or refresh nearby discoveries.</p></div>';return;}
    items.forEach(c=>{
      const d=userPosition&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)?distanceMetres(userPosition,c):null;
      const near=d!==null&&d<=state.radius;
      const was=collected(c.id);
      const item=document.createElement("button"); item.className="discovery-item";
      item.innerHTML=`<div class="discovery-art">${escapeHtml(c.art||icons[c.category]||"✦")}</div><div class="discovery-copy"><span class="card-meta">${escapeHtml(c.category||"Place")}${c.demo?" · DEMO":""}</span><h4>${escapeHtml(c.title)}</h4><p>${escapeHtml(c.short|| (c.kind==="legend"?"Local legend or folklore":"Open to explore the story"))}</p><div class="item-bottom"><span class="pill">${escapeHtml(c.rarity||"Discovery")}</span><span class="${was?"collected-stamp":"distance"}">${was?"✓ COLLECTED":d!==null?escapeHtml(fmtDistance(d)):c.demo?"Example card":"Nearby place"}</span></div></div>`;
      item.addEventListener("click",()=>openCard(c)); list.appendChild(item);
    });
    renderMapMarkers();
  }
  function renderCounts() {
    const n=state.collected.length;
    $("navCount").textContent=n; $("journalTotal").textContent=n;
    $("journalPlaces").textContent=new Set(state.collected.map(c=>`${c.lat?.toFixed?.(3)},${c.lon?.toFixed?.(3)}`)).size;
    $("journalBadges").textContent=Math.floor(n/3)+(state.observeDone?1:0);
  }
  function renderJournal() {
    const host=$("journalList"); host.innerHTML="";
    $("emptyJournal").hidden=state.collected.length>0;
    state.collected.slice().sort((a,b)=>(b.collectedAt||0)-(a.collectedAt||0)).forEach(c=>{
      const el=document.createElement("button"); el.className="journal-card"; el.style.textAlign="left"; el.style.color="inherit"; el.style.cursor="pointer";
      el.innerHTML=`<div class="big-art">${escapeHtml(c.art||icons[c.category]||"✦")}</div><span class="card-meta">${escapeHtml(c.category||"Discovery")}</span><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.short||c.story||"A discovery from your travels.")}</p><div class="item-bottom"><span class="pill">${c.kind==="legend"?"LEGEND":"DISCOVERY"}</span><span class="collected-stamp">✓ SAVED</span></div>`;
      el.addEventListener("click",()=>openCard(c)); host.appendChild(el);
    });
  }
  function renderQuizHistory() {
    const host=$("quizHistoryList");if(!host)return;const history=Array.isArray(state.quizHistory)?state.quizHistory:[];
    $("quizHistorySummary").textContent=history.length? `Latest: ${state.latestQuiz?state.latestQuiz.score+"/"+state.latestQuiz.total:"—"} · Best: ${state.quizBestScore===null?"—":state.quizBestScore+"/3"} · ${history.length} attempt${history.length===1?"":"s"}`:"No completed quizzes yet. Each attempt will be saved on this device.";
    host.innerHTML="";history.slice().reverse().forEach((attempt,index)=>{const item=document.createElement("details");item.className="quiz-history-item";const date=attempt.completedAt?new Date(attempt.completedAt).toLocaleString():"Date unavailable";const summary=document.createElement("summary");summary.textContent=`${date} — ${attempt.score}/${attempt.total}${index===0?" · Latest":""}`;const body=document.createElement("div");body.className="quiz-history-answers";(attempt.answers||[]).forEach((answer,i)=>{const p=document.createElement("p");p.textContent=`${i+1}. ${answer.question} — Your answer: ${answer.selectedAnswer||"No answer"}; correct answer: ${answer.correctAnswer||"Unknown"} (${answer.isCorrect?"correct":"not quite"}).`;body.appendChild(p);});item.append(summary,body);host.appendChild(item);});
  }
  function renderMissions() {
    const n=state.collected.length;
    $("missionBar").style.width=Math.min(100,n/3*100)+"%";
    $("missionProgress").textContent=`${Math.min(n,3)} / 3 cards`;
    $("observeProgress").textContent=state.observeDone?"✓ Complete":"0 / 1 discovery";
    $("observeBtn").textContent=state.observeDone?"Completed ✓":"Mark complete";
    $("observeBtn").disabled=state.observeDone;
    $("quizBestScore").textContent=state.quizBestScore===null?"":"Best: "+state.quizBestScore+`/${quizQuestions.length} · `+state.quizAttempts+" attempt"+(state.quizAttempts===1?"":"s");renderQuizHistory();
  }
  function openCard(c) {
    activeCardId=c.id;
    $("dialogArt").textContent=c.art||icons[c.category]||"✦";
    $("dialogMeta").textContent=`${c.category||"Discovery"} · ${c.kind==="legend"?"Folklore / legend":c.kind==="place"?"Place information":"Documented story"}${c.curated?" · RESEARCH-CHECKED STORY":""}${c.curated&&c.coordinateStatus!=="verified_target"?" · ARRIVAL POINT UNVERIFIED":""}${c.status==="approved-with-limits"?" · OBSERVATION ONLY":""}${c.demo?" · DEMO CARD":""}`;
    $("dialogTitle").textContent=c.title;
    $("dialogStory").textContent=c.story || "This map location has been identified from open geographic data. We don't yet have a separately verified historical story for this place.";
    let sourceHtml = c.url ? `<b>Source</b><br><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.source||"Open source")}</a>` : `<b>Source</b><br><span>No source link is available for this card.</span>`;
    if (c.curated) {
      const links = (c.sourceIds || []).map(id => sourceById[id]).filter(Boolean);
      sourceHtml = `<b>Sources</b><br>${links.map(src => `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title)} — ${escapeHtml(src.publisher)}</a>`).join("<br>") || "No linked sources"}`;
      if (c.approvedFacts && c.approvedFacts.length) sourceHtml += `<br><br><b>Approved facts in this pack</b><ul>${c.approvedFacts.map(f => `<li>${escapeHtml(f.claim)}</li>`).join("")}</ul>`;
      if (c.visitChallenge) sourceHtml += `<br><br><b>Try this on site</b><br>${escapeHtml(c.visitChallenge.prompt)}<br><small>${escapeHtml(c.visitChallenge.safety || "Stay in public areas and follow site rules.")}</small>`;
      if (c.locationArea) sourceHtml += `<br><br><small>Area: ${escapeHtml(c.locationArea)}. ${c.coordinateStatus === "verified_target" ? "Map target is reviewed; follow posted access and safety guidance." : "GPS collection is disabled until a safe arrival point is verified."}</small>`;
    }
    $("dialogSource").innerHTML = sourceHtml;
    let d=userPosition&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)?distanceMetres(userPosition,c):null;
    $("dialogDistance").textContent=d!==null?fmtDistance(d):c.demo?"Sample card — not a live nearby result":"Location distance unavailable";
    const actions=$("dialogActions"); actions.innerHTML="";
    const already=collected(c.id);
    const hasVisited=state.visited.includes(c.id);
    const visitEligible=d!==null&&d<=VISIT_RADIUS&&!c.demo&&(!c.curated || c.coordinateStatus === "verified_target");
    const eligible=!c.demo && (!c.curated || c.coordinateStatus === "verified_target") && c.kind!=="place" && !!c.url && d!==null && d<=state.radius;
    const btn=document.createElement("button"); btn.className="primary-button";
    if(already){btn.textContent="✓ In your journal";btn.disabled=true;}
    else if(eligible){btn.textContent="Collect discovery";btn.addEventListener("click",()=>collect(c));}
    else {btn.textContent=c.demo?"Demo only — not collectible":c.curated?"Location not verified — browse only":"Get closer to collect";btn.disabled=true;}
    actions.appendChild(btn);
    if(!c.demo && !c.curated && Number.isFinite(c.lat) && Number.isFinite(c.lon)){
      const visit=document.createElement("button");visit.className="quiet-button";
      visit.textContent=hasVisited?"✓ Visited":visitEligible?"Mark as visited":"Visit point (get within 35 m)";
      visit.disabled=hasVisited||!visitEligible;
      if(visitEligible&&!hasVisited)visit.addEventListener("click",()=>markVisited(c));
      actions.appendChild(visit);
      if(c.kind!=="place" && c.url){const quiz=document.createElement("button");quiz.className="quiet-button";quiz.textContent="Quiz me on this place";quiz.addEventListener("click",()=>startCardQuiz(c));actions.appendChild(quiz);}
    }
    if(!already && c.demo){
      const demo=document.createElement("button");demo.className="quiet-button";demo.textContent="Preview card";demo.addEventListener("click",()=>toast("Demo cards are examples only. Find a real nearby discovery to collect it."));actions.appendChild(demo);
    }
    $("cardDialog").showModal();
  }
  function markVisited(c) {
    if(!userPosition||distanceMetres(userPosition,c)>VISIT_RADIUS){toast("Get within 35 m of the mapped point to record a visit.");return;}
    if(!state.visited.includes(c.id))state.visited.push(c.id);
    state.visitLog=Array.isArray(state.visitLog)?state.visitLog:[];
    state.visitLog.push({id:c.id,title:c.title,visitedAt:Date.now(),distanceMetres:Math.round(distanceMetres(userPosition,c))});
    state.observeDone=true;saveState();renderDiscoveries();openCard(c);toast("Visit recorded in your explorer journal!");
  }
  function startCardQuiz(c) {
    const authored = curatedQuizzes.filter(q => q.cardId === c.id);
    if (authored.length) {
      const area = $("localQuizArea"); area.innerHTML = "";
      const q = authored[Math.floor(Math.random() * authored.length)];
      const prompt = document.createElement("p"); prompt.className = "quiz-question"; prompt.textContent = q.q;
      const opts = document.createElement("div"); opts.className = "quiz-options";
      const feedback = document.createElement("p"); feedback.className = "quiz-feedback"; feedback.hidden = true;
      area.append(prompt, opts, feedback);
      q.options.forEach((option, index) => { const b = document.createElement("button"); b.className = "quiz-option"; b.textContent = option; b.addEventListener("click", () => {
        [...opts.children].forEach(x => x.disabled = true); const good = index === q.answer; b.classList.add(good ? "answer-correct" : "answer-wrong");
        if (good) opts.children[q.answer].classList.add("answer-correct");
        feedback.hidden = false; feedback.className = "quiz-feedback " + (good ? "is-correct" : "is-learning");
        const sourceLinks = q.sourceIds.map(id => sourceById[id]).filter(Boolean).map(src => src.title).join(", ");
        feedback.textContent = `${good ? "Correct. " : "Not quite. "}${q.explanation} Source: ${sourceLinks}.`;
        const next = document.createElement("button"); next.className = "small-button"; next.textContent = "Choose another discovery"; next.addEventListener("click", renderLocalQuizPicker); area.appendChild(next);
      }); opts.appendChild(b); });
      return;
    }
    const years=[...new Set((c.story||"").match(/\b(?:1[0-9]{3}|20[0-2][0-9]|[1-9][0-9]{2})\b/g)||[])];
    const area=$("localQuizArea");area.innerHTML="";
    const q=document.createElement("p");q.className="quiz-question";
    const opts=document.createElement("div");opts.className="quiz-options";
    const feedback=document.createElement("p");feedback.className="quiz-feedback";feedback.hidden=true;
    let correctText, prompt, options;
    if(years.length){
      correctText=years[0];prompt=`According to the sourced summary for “${c.title}”, which year is mentioned?`;
      const distractors=["1000","1750","1900","2000"].filter(x=>x!==correctText).slice(0,3);options=[correctText,...distractors].sort(()=>Math.random()-.5);
    } else {
      correctText=c.title;prompt=`Which discovery does this source summary describe?`;
      const alternatives=discoveries.filter(x=>x.id!==c.id&&!x.demo&&x.kind!=="place").slice(0,3).map(x=>x.title);
      options=[correctText,...alternatives].sort(()=>Math.random()-.5);
      if(options.length<2){area.textContent="Find a few more nearby sourced story cards to make a place quiz. You can still open the source and explore the mission prompts.";return;}
    }
    q.textContent=prompt;area.append(q,opts,feedback);
    options.forEach(option=>{const b=document.createElement("button");b.className="quiz-option";b.textContent=option;b.addEventListener("click",()=>{[...opts.children].forEach(x=>x.disabled=true);const good=option===correctText;b.classList.add(good?"answer-correct":"answer-wrong");feedback.hidden=false;feedback.className="quiz-feedback "+(good?"is-correct":"is-learning");feedback.textContent=good?`Correct. Check the source link on the card to read the original context. Source: ${c.source||"linked article"}.`:`Not quite. The summary's answer is “${correctText}”. Open the linked source to see the context.`;const next=document.createElement("button");next.className="small-button";next.textContent="Choose another discovery";next.addEventListener("click",renderLocalQuizPicker);area.appendChild(next);});opts.appendChild(b);});
  }
  function renderLocalQuizPicker() {
    const candidates=discoveries.filter(c=>!c.demo&&c.kind!=="place"&&c.url&&c.story&&c.story.length>80&&(c.curated?curatedQuizzes.some(q=>q.cardId===c.id):true));
    $("localQuizDescription").textContent=candidates.length?`${candidates.length} sourced local stories available. Questions use details visible in the linked summary; open the source to check the context.`:"Locate yourself to load nearby sourced stories. Place-only map pins are leads, not verified historical accounts.";
    const area=$("localQuizArea");area.innerHTML="";
    if(!candidates.length){const b=document.createElement("button");b.className="small-button";b.textContent="Find nearby discoveries";b.addEventListener("click",locate);area.appendChild(b);return;}
    candidates.slice(0,8).forEach(c=>{const b=document.createElement("button");b.className="quiz-option local-quiz-choice";b.textContent=`${c.art||"📚"} ${c.title}`;b.addEventListener("click",()=>startCardQuiz(c));area.appendChild(b);});
  }
  function collect(c) {
    if(collected(c.id)) return;
    if(c.demo || (c.curated && c.coordinateStatus !== "verified_target") || c.kind==="place" || !c.url){toast("Only sourced story cards can be collected; this place needs a verified story first.");return;}
    const d=userPosition?distanceMetres(userPosition,c):Infinity;
    if(d>state.radius){toast("You're outside the unlock range. Explore safely and try again.");return;}
    state.collected.push({...c,collectedAt:Date.now(),distanceAtCollection:Math.round(d)});
    saveState(); renderDiscoveries(); openCard(state.collected[state.collected.length-1]);
    toast(state.collected.length===3?"Badge earned: Curiosity Collector!":"Discovery saved to your journal!");
  }
  function showLocationIntro(){
    const dialog=$("locationIntroDialog");
    if(dialog && !dialog.open)dialog.showModal();
  }
  async function autoStartLocation(){
    if(!state.locationSetupComplete)return;
    if(!navigator.geolocation){updateLocationStatus("GPS isn't supported in this browser");return;}
    if(!window.isSecureContext){updateLocationStatus("Open the HTTPS version to use GPS");return;}
    // Only silently refresh on launch when the browser already grants location access.
    // If permission is still prompt/denied, leave the user in control of requesting it.
    try{
      if(navigator.permissions && navigator.permissions.query){
        const permission=await navigator.permissions.query({name:"geolocation"});
        if(permission.state==="granted"){
          updateLocationStatus("Refreshing your location…");locate();
        }else if(permission.state==="denied"){
          updateLocationStatus("Location blocked · enable it in browser settings");
        }else{
          updateLocationStatus("Tap Find discoveries nearby to enable location");
        }
      }else{
        updateLocationStatus("Refreshing your location…");locate();
      }
    }catch{
      updateLocationStatus("Refreshing your location…");locate();
    }
  }
  function updateLocationStatus(s){$("locationStatus").textContent=s;}
  async function fetchNearby(lat,lon) {
    updateLocationStatus("Finding nearby stories…");
    const results=[];
    // Wikimedia geosearch gives actual nearby article pages; summaries provide a link to the underlying article.
    try {
      const url=`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=${Math.min(5000,Math.max(300,state.radius*3))}&gslimit=35&gsnamespace=0&format=json&origin=*`;
      const r=await fetch(url); if(!r.ok) throw new Error("Wikipedia geosearch unavailable");
      const data=await r.json();
      const pages=(data.query?.geosearch||[]).slice(0,25);
      const summaries=await Promise.all(pages.map(async p=>{
        try{
          const sr=await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.title.replace(/ /g,"_"))}`);
          if(!sr.ok) return null;
          const s=await sr.json();
          const extract=(s.extract||"").trim();
          const lower=extract.toLowerCase();
          // Skip disambiguation and very thin entries: a pin or stub is not a useful story card.
          if(extract.length<140 || /may refer to:|is a disambiguation page|can refer to several things/i.test(extract)) return null;
          const category=guessCategory(p.title+" "+extract);
          return {id:"wiki-"+p.pageid,title:p.title,category,lat:p.lat,lon:p.lon,story:extract+"\n\nSource note: this is a Wikipedia summary. Open the article to inspect its references and follow the cited heritage, museum or primary sources for important historical claims.",short:extract.length>100?extract.slice(0,97)+"…":extract,
            source:"Wikipedia article summary · check references",url:s.content_urls?.desktop?.page||`https://en.wikipedia.org/?curid=${p.pageid}`,kind:"documented",
            art:icons[category]||"📚",rarity:p.dist<250?"Uncommon":"Discovery",dist:p.dist,sourceNote:"Secondary summary; references should be checked"};
        }catch{return null;}
      }));
      results.push(...summaries.filter(Boolean));
    } catch(e) { console.warn(e); }
    // OpenStreetMap named points of interest are useful location leads, but are not presented as historical facts.
    try {
      const query=`[out:json][timeout:12];(node(around:${Math.min(5000,Math.max(300,state.radius*3))},${lat},${lon})[name][historic];node(around:${Math.min(5000,Math.max(300,state.radius*3))},${lat},${lon})[name][tourism~"museum|attraction|artwork"];node(around:${Math.min(5000,Math.max(300,state.radius*3))},${lat},${lon})[name][amenity=place_of_worship];way(around:${Math.min(5000,Math.max(300,state.radius*3))},${lat},${lon})[name][historic];way(around:${Math.min(5000,Math.max(300,state.radius*3))},${lat},${lon})[name][tourism~"museum|attraction|artwork"];);out center tags 35;`;
      const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:query});
      if(!r.ok) throw new Error("OpenStreetMap lookup unavailable");
      const data=await r.json();
      for(const p of (data.elements||[])){
        const tags=p.tags||{}, title=tags.name;
        const plat=p.lat??p.center?.lat, plon=p.lon??p.center?.lon;
        if(!title||!Number.isFinite(plat)||!Number.isFinite(plon))continue;
        const id=`osm-${p.type}-${p.id}`;
        if(results.some(c=>distanceMetres(c,{lat:plat,lon:plon})<20 && c.title.toLowerCase()===title.toLowerCase()))continue;
        let category=tags.historic?"History":tags.tourism==="museum"?"History":tags.amenity==="place_of_worship"?"Architecture":"Place";
        results.push({id,title,category,lat:plat,lon:plon,story:`${title} is mapped as ${tags.historic?`a historic ${tags.historic.replaceAll("_"," ")}`:tags.tourism?`a ${tags.tourism.replaceAll("_"," ")}`:tags.amenity==="place_of_worship"?"a place of worship":"a local point of interest"} in OpenStreetMap. This is a place-identification card, not a verified historical account. Look for an official plaque or visitor information to learn more.`,short:"Mapped point of interest · open to inspect",source:"OpenStreetMap",url:`https://www.openstreetmap.org/${p.type}/${p.id}`,kind:"place",art:icons[category]||"📍",rarity:"Discovery"});
      }
    } catch(e) { console.warn(e); }
    // Keep only discoveries with coordinates and avoid showing the same article twice.
    const seen=new Set();
    const clean=results.filter(c=>{
      if(!c.id||!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||seen.has(c.id))return false;
      seen.add(c.id);return true;
    });
    return clean.sort((a,b)=>distanceMetres({lat,lon},a)-distanceMetres({lat,lon},b)).slice(0,45);
  }
  function guessCategory(text) {
    const t=text.toLowerCase();
    if(/legend|myth|folklore|ghost|dragon|siren/.test(t))return "Legend";
    if(/scientist|invention|physics|mathemat|astronom|science|engineer/.test(t))return "Science";
    if(/mountain|tree|park|island|river|volcano|animal|plant|garden|beach/.test(t))return "Nature";
    if(/architect|church|cathedral|palace|building|bridge|castle|basilica|temple|theatre|theater|monument/.test(t))return "Architecture";
    if(/born|writer|artist|composer|king|queen|emperor|philosopher|poet|politician/.test(t))return "People";
    return "History";
  }
  async function locate() {
    if(!navigator.geolocation){updateLocationStatus("GPS isn't supported in this browser");toast("GPS isn't supported by this browser.");return;}
    if(!window.isSecureContext){updateLocationStatus("Open the HTTPS version to use GPS");toast("GPS needs HTTPS (or localhost).");return;}
    updateLocationStatus("Requesting location permission…");
    $("locateBtn").disabled=true;
    navigator.geolocation.getCurrentPosition(async pos=>{
      userPosition={lat:pos.coords.latitude,lon:pos.coords.longitude};
      rememberExploredPosition(userPosition);
      ensureMap(userPosition.lat,userPosition.lon);
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);
      watchId=navigator.geolocation.watchPosition(p=>{
        userPosition={lat:p.coords.latitude,lon:p.coords.longitude};
        const exploredCountBefore=(state.explored||[]).length;rememberExploredPosition(userPosition);
        if((state.explored||[]).length!==exploredCountBefore&&window.worldHunterExploredLayer){window.worldHunterExploredLayer.clearLayers();state.explored.forEach(point=>L.circle([point.lat,point.lon],{radius:Math.max(20,state.radius*1.5),color:"#8a9e73",weight:1,fillColor:"#c7d8b4",fillOpacity:.20,dashArray:"3 5",interactive:false}).addTo(window.worldHunterExploredLayer));renderFogOfWar();}
        if(userMarker)userMarker.setLatLng([userPosition.lat,userPosition.lon]);
        if(acquisitionCircle)acquisitionCircle.setLatLng([userPosition.lat,userPosition.lon]);
        maybeAutoCollect();renderDiscoveries();renderMapMarkers();
      },err=>console.warn("GPS watch",err),{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
      try{
        const fresh=await fetchNearby(userPosition.lat,userPosition.lon);
        if(fresh.length){
          discoveries=[...fresh,...curatedCards,...demoCards];
          $("dataNote").textContent="Live results combine nearby Wikipedia articles and named OpenStreetMap places. An OSM place card identifies a location; it does not claim the place has a verified historical story. Demo cards are examples, not nearby results.";
        }else{
          discoveries=[...curatedCards,...demoCards];
          $("dataNote").textContent="No live results came back. Check your connection or try again later. Demo cards are examples, not nearby results.";
        }
      }catch(e){discoveries=[...curatedCards,...demoCards];$("dataNote").textContent="Could not load nearby data right now. Demo cards are examples, not nearby results.";}
      renderDiscoveries();renderMapMarkers();
      updateLocationStatus(`Location ready · GPS accuracy ±${Math.round(pos.coords.accuracy)} m`);
      maybeAutoCollect();
      $("locateBtn").disabled=false;
      if(!discoveries.some(c=>!c.demo))toast("No nearby stories found yet. Try Refresh in a more central spot.");
      else toast("Nearby discoveries loaded. Explore safely!");
    },err=>{
      const msg=err.code===1?"Location permission denied":err.code===2?"Location unavailable":"Location request timed out";
      updateLocationStatus(msg);toast(msg+". You can still browse the sample cards.");$("locateBtn").disabled=false;
    },{enableHighAccuracy:true,timeout:20000,maximumAge:15000});
  }
  function maybeAutoCollect() {
    if(!state.autoCollect||!userPosition)return;
    const eligible=discoveries.filter(c=>!c.demo&&(!c.curated||c.coordinateStatus==="verified_target")&&c.kind!=="place"&&c.url&&!collected(c.id)&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&distanceMetres(userPosition,c)<=state.radius);
    // Auto-save sourced discoveries in proximity. OSM place-only cards have a source URL but no historical claim.
    eligible.forEach(c=>{
      state.collected.push({...c,collectedAt:Date.now(),distanceAtCollection:Math.round(distanceMetres(userPosition,c))});
    });
    if(eligible.length){saveState();renderDiscoveries();toast(eligible.length===1?"Discovery automatically added to your journal!":`${eligible.length} discoveries added to your journal!`);}
  }
  function exportJournal() {
    const blob=new Blob([JSON.stringify({app:"World Hunter",version:1,exportedAt:new Date().toISOString(),collected:state.collected,settings:{radius:state.radius,autoCollect:state.autoCollect}},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="world-hunter-journal.json";a.click();URL.revokeObjectURL(url);
    toast("Journal export prepared.");
  }
  const fallbackQuizQuestions = [
    {q:"A map pin marks a centuries-old tower. What does that pin prove by itself?", options:["The tower's exact age","That the place is mapped at that location","Who built the tower","That every story about it is true"], answer:1, explanation:"A map pin helps identify a place. It does not verify a date, a builder or a story; those claims need a reliable source."},
    {q:"A local legend says a hidden tunnel runs beneath a castle. What is the fairest way to describe it?", options:["A proven fact because people repeat it","A false story that has no cultural value","A local legend unless good evidence verifies it","An official record of the castle's construction"], answer:2, explanation:"Legends can be valuable parts of local culture, but repetition alone doesn't prove that an event happened."},
    {q:"You read that a monument was built in 1450. Which is the strongest next step?", options:["Trust the first search result","Check the article's references and a credible heritage or museum source","Assume the date is correct if the page has a photo","Use the map pin as proof of the date"], answer:1, explanation:"Cross-checking the claim against cited references and a credible heritage or museum source gives you stronger evidence."}
  ];
  let quizQuestions = [...fallbackQuizQuestions];
  function startQuiz() {
    quizIndex=0;quizScore=0;quizAnswered=false;quizAnswers=[];quizStartedAt=new Date().toISOString();
    $("quizIntro").hidden=true;$("quizResult").hidden=true;$("quizPlay").hidden=false;
    renderQuizQuestion();
  }
  function renderQuizQuestion() {
    const q=quizQuestions[quizIndex]; quizAnswered=false;
    $("quizCounter").textContent=`Question ${quizIndex+1} of ${quizQuestions.length}`;
    $("quizScore").textContent=`Score: ${quizScore}`;
    $("quizBar").style.width=((quizIndex)/quizQuestions.length*100)+"%";
    $("quizQuestion").textContent=q.q;
    $("quizFeedback").hidden=true;$("quizNextBtn").hidden=true;
    const options=$("quizOptions");options.innerHTML="";
    q.options.forEach((label,i)=>{
      const b=document.createElement("button");b.type="button";b.className="quiz-option";b.textContent=label;
      b.addEventListener("click",()=>answerQuiz(i));options.appendChild(b);
    });
  }
  function answerQuiz(choice) {
    if(quizAnswered)return;quizAnswered=true;
    const q=quizQuestions[quizIndex], correct=choice===q.answer;
    if(correct)quizScore++;
    quizAnswers.push({questionId:q.id||null,question:q.q,selectedIndex:choice,selectedAnswer:q.options[choice],correctIndex:q.answer,correctAnswer:q.options[q.answer],isCorrect:correct,explanation:q.explanation||"",sourceIds:q.sourceIds||[]});
    [...$("quizOptions").children].forEach((b,i)=>{
      b.disabled=true;
      if(i===q.answer)b.classList.add("answer-correct");
      else if(i===choice)b.classList.add("answer-wrong");
    });
    const quizSources = (q.sourceIds || []).map(id => sourceById[id]).filter(Boolean);
    $("quizFeedback").innerHTML = escapeHtml((correct?"You got it! ":"Good try! ")+q.explanation) +
      (quizSources.length ? `<br><br><b>Sources:</b><br>${quizSources.map(src => `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title)} — ${escapeHtml(src.publisher)}</a>`).join("<br>")}` : "");
    $("quizFeedback").className="quiz-feedback "+(correct?"is-correct":"is-learning");
    $("quizFeedback").hidden=false;
    $("quizNextBtn").textContent=quizIndex===quizQuestions.length-1?"See results →":"Next question →";
    $("quizNextBtn").hidden=false;
    $("quizBar").style.width=((quizIndex+1)/quizQuestions.length*100)+"%";
  }
  function finishQuiz() {
    const completedAt=new Date().toISOString();
    const attempt={id:(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():("quiz-"+Date.now()+"-"+Math.random().toString(36).slice(2,8)),type:"fact-detective",startedAt:quizStartedAt||completedAt,completedAt,score:quizScore,total:quizQuestions.length,answers:quizAnswers.slice()};
    state.quizHistory=Array.isArray(state.quizHistory)?state.quizHistory:[];
    state.quizHistory.push(attempt);state.latestQuiz=attempt;
    state.quizAttempts=(state.quizAttempts||0)+1;state.quizCompleted=true;
    if(state.quizBestScore===null||quizScore>state.quizBestScore)state.quizBestScore=quizScore;
    saveState();renderQuizHistory();
    $("quizPlay").hidden=true;$("quizResult").hidden=false;$("quizFinalScore").textContent=`${quizScore} / ${quizQuestions.length}`;
    $("quizResultTitle").textContent=quizScore===quizQuestions.length?"Brilliant fact detective!":quizScore>=Math.ceil(quizQuestions.length*0.67)?"Great exploring!":"Curiosity is the real superpower.";
    $("quizResultCopy").textContent=quizScore===quizQuestions.length?"You checked the evidence and spotted the difference between a place, a story and a proven fact.":"Every answer is a chance to learn. Have another go whenever you're ready, or try these ideas on your next walk.";
    $("quizBar").style.width="100%";
    toast(quizScore===quizQuestions.length?"Fact Detective badge earned!":"Mini quiz complete — progress saved!");
  }
  $("startQuizBtn").addEventListener("click",startQuiz);
  $("retryQuizBtn").addEventListener("click",startQuiz);
  $("quizNextBtn").addEventListener("click",()=>{if(quizIndex<quizQuestions.length-1){quizIndex++;renderQuizQuestion();}else finishQuiz();});

  $("startLocalQuizBtn").addEventListener("click",renderLocalQuizPicker);
  $("locateBtn").addEventListener("click",()=>{
    if(!state.locationSetupComplete){showLocationIntro();return;}
    locate();
  });
  $("enableLocationBtn").addEventListener("click",()=>{
    state.locationSetupComplete=true;state.locationIntroDismissed=false;saveState();
    $("locationIntroDialog").close();locate();
  });
  $("notNowLocationBtn").addEventListener("click",()=>{
    state.locationIntroDismissed=true;saveState();$("locationIntroDialog").close();
    updateLocationStatus("Location not enabled · you can enable it any time");
  });
  $("refreshBtn").addEventListener("click",()=>userPosition?locate():state.locationSetupComplete?locate():showLocationIntro());
  $("categoryFilter").addEventListener("change",renderDiscoveries);
  $("settingsBtn").addEventListener("click",()=>$("settingsDialog").showModal());
  const radiusPresets=[25,50,100,150,250,500,1000];
  $("radiusSelect").value=radiusPresets.includes(state.radius)?String(state.radius):"custom";
  $("customRadius").value=String(state.radius);
  $("customRadiusWrap").hidden=$("radiusSelect").value!=="custom";
  function applyRadius(value){state.radius=Math.max(10,Math.min(5000,Math.round(Number(value)||DEFAULT_RADIUS)));$("radiusLabel").textContent=`Unlock radius: ${state.radius} m`;$("customRadius").value=String(state.radius);saveState();if(userPosition)ensureMap(userPosition.lat,userPosition.lon);renderDiscoveries();renderMapMarkers();maybeAutoCollect();}
  $("radiusSelect").addEventListener("change",e=>{const custom=e.target.value==="custom";$("customRadiusWrap").hidden=!custom;if(!custom)applyRadius(e.target.value);else $("customRadius").focus();});
  $("customRadius").addEventListener("change",e=>applyRadius(e.target.value));
  $("autoCollect").checked=state.autoCollect;
  $("recenterMapBtn").addEventListener("click",()=>{if(!userPosition){toast("Find your location first.");locate();return;} if(map){map.setView([userPosition.lat,userPosition.lon],17,{animate:true});if(userMarker)userMarker.openPopup();}});
  $("autoCollect").addEventListener("change",e=>{state.autoCollect=e.target.checked;saveState();toast(state.autoCollect?"Automatic collection enabled":"Automatic collection paused");});
  $("exportBtn").addEventListener("click",exportJournal);
  $("observeBtn").addEventListener("click",()=>{state.observeDone=true;saveState();toast("Mission complete — Observation Scout badge earned!");});
  $("legendTipBtn").addEventListener("click",()=>$("legendTip").hidden=!$("legendTip").hidden);
  $("clearDataBtn").addEventListener("click",()=>{
    if(!confirm("Clear all collected cards and mission progress from this device? This cannot be undone unless you exported your journal."))return;
    state={collected:[],radius:DEFAULT_RADIUS,visited:[],explored:[],quizHistory:[],latestQuiz:null,localQuizBest:null,autoCollect:true,observeDone:false,quizBestScore:null,quizAttempts:0,quizCompleted:false,locationSetupComplete:false,locationIntroDismissed:false,profile:"Explorer"};saveState();
    $("radiusSelect").value=String(DEFAULT_RADIUS);$("customRadiusWrap").hidden=true;$("customRadius").value=String(DEFAULT_RADIUS);$("autoCollect").checked=true;$("radiusLabel").textContent=`Unlock radius: ${DEFAULT_RADIUS} m`;renderDiscoveries();if(userPosition)ensureMap(userPosition.lat,userPosition.lon);$("settingsDialog").close();toast("Local progress cleared.");
  });
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
  $("installBtn").addEventListener("click",async()=>{
    if(!deferredInstall){toast("In Chrome on Android, use the menu → Install app / Add to Home screen.");return;}
    deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;
  });
  window.addEventListener("appinstalled",()=>toast("World Hunter installed — happy exploring!"));
  if("serviceWorker" in navigator && location.protocol!=="file:")window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker",e)));
  $("radiusLabel").textContent=`Unlock radius: ${state.radius} m`;
  $("mapRadiusLabel").textContent=`Map view: ${(state.radius*3)>=1000?((state.radius*3/1000).toFixed(1)+" km"):((state.radius*3)+" m")} radius`;
  renderLocalQuizPicker();renderDiscoveries();renderCounts();renderJournal();renderMissions();
  loadCuratedContent();
  if(!state.locationSetupComplete && !state.locationIntroDismissed){
    // First launch: explain the location request before invoking the browser permission prompt.
    setTimeout(showLocationIntro,250);
  }else{
    autoStartLocation();
  }
})();
