/* World Hunter MVP. No account or location tracking backend. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "worldHunterStateV1";
  const DEFAULT_RADIUS = 100;
  const icons = {History:"🏛️",Architecture:"🏰",People:"🧭",Nature:"🌿",Science:"⚗️",Legend:"🌙",Place:"📍"};
  const demoCards = [
    {id:"demo-pompeii",title:"Pompeii: a city paused in time",category:"History",lat:40.7506,lon:14.4869,story:"In AD 79, Mount Vesuvius erupted and buried Pompeii under volcanic material. The deposits preserved buildings, objects and traces of everyday Roman life, giving archaeologists an extraordinary snapshot of an ancient city. This is a demo card, not a nearby GPS result.",source:"UNESCO World Heritage Centre",url:"https://whc.unesco.org/en/list/829/",kind:"documented",demo:true,art:"🏛️",rarity:"Uncommon"},
    {id:"demo-sorrento",title:"Sorrento and the sirens",category:"Legend",lat:40.6263,lon:14.3758,story:"In Greek mythology, sirens sang so beautifully that sailors were tempted towards danger. Later traditions linked sirens with parts of southern Italy's coastline. The exact locations vary across tellings, and the story belongs to mythology rather than verified local history. This is a demo card, not a nearby GPS result.",source:"Encyclopaedia Britannica — Siren",url:"https://www.britannica.com/topic/Siren-Greek-mythology",kind:"legend",demo:true,art:"🧜",rarity:"Rare"},
    {id:"demo-pantheon",title:"The Pantheon's giant concrete dome",category:"Architecture",lat:41.8986,lon:12.4769,story:"Rome's Pantheon has one of the world's most famous unreinforced concrete domes. Its builders used lighter materials higher up and a circular opening called an oculus at the top. The oculus also lets daylight—and rain—into the building. This is a demo card, not a nearby GPS result.",source:"Encyclopaedia Britannica — Pantheon",url:"https://www.britannica.com/topic/Pantheon-building-Rome-Italy",kind:"documented",demo:true,art:"🏛️",rarity:"Rare"}
  ];

  let state = loadState();
  let discoveries = [...demoCards];
  let map = null, userMarker = null, layer = null, watchId = null, userPosition = null;
  let deferredInstall = null, activeCardId = null, toastTimer = null;
  let quizIndex = 0, quizScore = 0, quizAnswered = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {collected:Array.isArray(saved.collected)?saved.collected:[], radius:[50,100,150,250].includes(saved.radius)?saved.radius:DEFAULT_RADIUS,
        autoCollect:saved.autoCollect !== false, observeDone:!!saved.observeDone, quizBestScore:Number.isFinite(saved.quizBestScore)?saved.quizBestScore:null, quizAttempts:Number.isFinite(saved.quizAttempts)?saved.quizAttempts:0, quizCompleted:!!saved.quizCompleted, profile:saved.profile || "Explorer"};
    } catch { return {collected:[],radius:DEFAULT_RADIUS,autoCollect:true,observeDone:false,quizBestScore:null,quizAttempts:0,quizCompleted:false,profile:"Explorer"}; }
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

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    ["explore","journal","missions"].forEach(name=>$(name+"Panel").hidden=name!==tab);
    if (tab==="explore" && map) setTimeout(()=>map.invalidateSize(),80);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));

  function ensureMap(lat,lon) {
    if (!window.L) {
      $("dataNote").textContent="The map library could not load. Discovery cards and the journal still work; try again with an internet connection.";
      return;
    }
    if (!map) {
      $("map").innerHTML="";
      map=L.map("map",{zoomControl:true}).setView([lat,lon],15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);
      layer=L.layerGroup().addTo(map);
    } else { map.setView([lat,lon],15); }
    if (userMarker) userMarker.remove();
    userMarker=L.circleMarker([lat,lon],{radius:8,color:"#fff",weight:3,fillColor:"#24574b",fillOpacity:1}).addTo(map).bindPopup("You are here (only visible on this device).");
    renderMapMarkers();
    setTimeout(()=>map.invalidateSize(),100);
  }
  function renderMapMarkers() {
    if (!map || !layer) return;
    layer.clearLayers();
    discoveries.filter(c=>Number.isFinite(c.lat)&&Number.isFinite(c.lon)).forEach(c=>{
      const was=collected(c.id), near=userPosition?distanceMetres(userPosition,c)<=state.radius:false;
      const marker=L.circleMarker([c.lat,c.lon],{radius:was?8:6,color:"#fff",weight:2,fillColor:was?"#24574b":(near?"#d86e50":"#d5a83f"),fillOpacity:.95});
      marker.bindPopup(`<b>${escapeHtml(c.title)}</b><br>${was?"Collected":near?"In unlock range":escapeHtml(c.category||"Discovery")}<br><button type="button" onclick="window.worldHunterOpen('${escapeHtml(c.id)}')">Open card</button>`);
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
  function renderMissions() {
    const n=state.collected.length;
    $("missionBar").style.width=Math.min(100,n/3*100)+"%";
    $("missionProgress").textContent=`${Math.min(n,3)} / 3 cards`;
    $("observeProgress").textContent=state.observeDone?"✓ Complete":"0 / 1 discovery";
    $("observeBtn").textContent=state.observeDone?"Completed ✓":"Mark complete";
    $("observeBtn").disabled=state.observeDone;
    $("quizBestScore").textContent=state.quizBestScore===null?"":"Best: "+state.quizBestScore+"/3 · "+state.quizAttempts+" attempt"+(state.quizAttempts===1?"":"s");
  }
  function openCard(c) {
    activeCardId=c.id;
    $("dialogArt").textContent=c.art||icons[c.category]||"✦";
    $("dialogMeta").textContent=`${c.category||"Discovery"} · ${c.kind==="legend"?"Folklore / legend":c.kind==="place"?"Place information":"Documented story"}${c.demo?" · DEMO CARD":""}`;
    $("dialogTitle").textContent=c.title;
    $("dialogStory").textContent=c.story || "This map location has been identified from open geographic data. We don't yet have a separately verified historical story for this place.";
    $("dialogSource").innerHTML=c.url?`<b>Source</b><br><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.source||"Open source")}</a>${c.source==="Wikipedia article summary · check references"?'<br><span>Wikipedia text is available under CC BY-SA; open the article for contributor attribution and references.</span>':''}`:`<b>Source</b><br><a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">OpenStreetMap place data</a><br><span>This identifies the mapped place; it is not itself proof of a historical claim.</span>`;
    let d=userPosition&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)?distanceMetres(userPosition,c):null;
    $("dialogDistance").textContent=d!==null?fmtDistance(d):c.demo?"Sample card — not a live nearby result":"Location distance unavailable";
    const actions=$("dialogActions"); actions.innerHTML="";
    const already=collected(c.id);
    const eligible=!c.demo && c.kind!=="place" && !!c.url && d!==null && d<=state.radius;
    const btn=document.createElement("button"); btn.className="primary-button";
    if(already){btn.textContent="✓ In your journal";btn.disabled=true;}
    else if(eligible){btn.textContent="Collect discovery";btn.addEventListener("click",()=>collect(c));}
    else {btn.textContent=c.demo?"Demo only — not collectible":"Get closer to collect";btn.disabled=true;}
    actions.appendChild(btn);
    if(!already && c.demo){
      const demo=document.createElement("button");demo.className="quiet-button";demo.textContent="Preview card";demo.addEventListener("click",()=>toast("Demo cards are examples only. Find a real nearby discovery to collect it."));actions.appendChild(demo);
    }
    $("cardDialog").showModal();
  }
  function collect(c) {
    if(collected(c.id)) return;
    if(c.demo || c.kind==="place" || !c.url){toast("Only sourced story cards can be collected; this place needs a verified story first.");return;}
    const d=userPosition?distanceMetres(userPosition,c):Infinity;
    if(d>state.radius){toast("You're outside the unlock range. Explore safely and try again.");return;}
    state.collected.push({...c,collectedAt:Date.now(),distanceAtCollection:Math.round(d)});
    saveState(); renderDiscoveries(); openCard(state.collected[state.collected.length-1]);
    toast(state.collected.length===3?"Badge earned: Curiosity Collector!":"Discovery saved to your journal!");
  }
  function updateLocationStatus(s){$("locationStatus").textContent=s;}
  async function fetchNearby(lat,lon) {
    updateLocationStatus("Finding nearby stories…");
    const results=[];
    // Wikimedia geosearch gives actual nearby article pages; summaries provide a link to the underlying article.
    try {
      const url=`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=1000&gslimit=35&gsnamespace=0&format=json&origin=*`;
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
      const query=`[out:json][timeout:12];(node(around:1000,${lat},${lon})[name][historic];node(around:1000,${lat},${lon})[name][tourism~"museum|attraction|artwork"];node(around:1000,${lat},${lon})[name][amenity=place_of_worship];way(around:1000,${lat},${lon})[name][historic];way(around:1000,${lat},${lon})[name][tourism~"museum|attraction|artwork"];);out center tags 35;`;
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
      ensureMap(userPosition.lat,userPosition.lon);
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);
      watchId=navigator.geolocation.watchPosition(p=>{
        userPosition={lat:p.coords.latitude,lon:p.coords.longitude};
        if(userMarker)userMarker.setLatLng([userPosition.lat,userPosition.lon]);
        maybeAutoCollect();renderDiscoveries();
      },err=>console.warn("GPS watch",err),{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
      try{
        const fresh=await fetchNearby(userPosition.lat,userPosition.lon);
        if(fresh.length){
          discoveries=[...fresh,...demoCards];
          $("dataNote").textContent="Live results combine nearby Wikipedia articles and named OpenStreetMap places. An OSM place card identifies a location; it does not claim the place has a verified historical story. Demo cards are examples, not nearby results.";
        }else{
          discoveries=[...demoCards];
          $("dataNote").textContent="No live results came back. Check your connection or try again later. Demo cards are examples, not nearby results.";
        }
      }catch(e){discoveries=[...demoCards];$("dataNote").textContent="Could not load nearby data right now. Demo cards are examples, not nearby results.";}
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
    const eligible=discoveries.filter(c=>!c.demo&&c.kind!=="place"&&c.url&&!collected(c.id)&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&distanceMetres(userPosition,c)<=state.radius);
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
  const quizQuestions = [
    {q:"A map pin marks a centuries-old tower. What does that pin prove by itself?", options:["The tower's exact age","That the place is mapped at that location","Who built the tower","That every story about it is true"], answer:1, explanation:"A map pin helps identify a place. It does not verify a date, a builder or a story; those claims need a reliable source."},
    {q:"A local legend says a hidden tunnel runs beneath a castle. What is the fairest way to describe it?", options:["A proven fact because people repeat it","A false story that has no cultural value","A local legend unless good evidence verifies it","An official record of the castle's construction"], answer:2, explanation:"Legends can be valuable parts of local culture, but repetition alone doesn't prove that an event happened."},
    {q:"You read that a monument was built in 1450. Which is the strongest next step?", options:["Trust the first search result","Check the article's references and a credible heritage or museum source","Assume the date is correct if the page has a photo","Use the map pin as proof of the date"], answer:1, explanation:"Cross-checking the claim against cited references and a credible heritage or museum source gives you stronger evidence."}
  ];
  function startQuiz() {
    quizIndex=0;quizScore=0;quizAnswered=false;
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
    [...$("quizOptions").children].forEach((b,i)=>{
      b.disabled=true;
      if(i===q.answer)b.classList.add("answer-correct");
      else if(i===choice)b.classList.add("answer-wrong");
    });
    $("quizFeedback").textContent=(correct?"You got it! ":"Good try! ")+q.explanation;
    $("quizFeedback").className="quiz-feedback "+(correct?"is-correct":"is-learning");
    $("quizFeedback").hidden=false;
    $("quizNextBtn").textContent=quizIndex===quizQuestions.length-1?"See results →":"Next question →";
    $("quizNextBtn").hidden=false;
    $("quizBar").style.width=((quizIndex+1)/quizQuestions.length*100)+"%";
  }
  function finishQuiz() {
    state.quizAttempts=(state.quizAttempts||0)+1;
    state.quizCompleted=true;
    if(state.quizBestScore===null||quizScore>state.quizBestScore)state.quizBestScore=quizScore;
    saveState();
    $("quizPlay").hidden=true;$("quizResult").hidden=false;$("quizFinalScore").textContent=`${quizScore} / ${quizQuestions.length}`;
    $("quizResultTitle").textContent=quizScore===3?"Brilliant fact detective!":quizScore===2?"Great exploring!":"Curiosity is the real superpower.";
    $("quizResultCopy").textContent=quizScore===3?"You checked the evidence and spotted the difference between a place, a story and a proven fact.":"Every answer is a chance to learn. Have another go whenever you're ready, or try these ideas on your next walk.";
    $("quizBar").style.width="100%";
    toast(quizScore===3?"Fact Detective badge earned!":"Mini quiz complete — progress saved!");
  }
  $("startQuizBtn").addEventListener("click",startQuiz);
  $("retryQuizBtn").addEventListener("click",startQuiz);
  $("quizNextBtn").addEventListener("click",()=>{if(quizIndex<quizQuestions.length-1){quizIndex++;renderQuizQuestion();}else finishQuiz();});

  $("locateBtn").addEventListener("click",locate);
  $("refreshBtn").addEventListener("click",()=>userPosition?locate():toast("Tap “Find discoveries nearby” to enable GPS first."));
  $("categoryFilter").addEventListener("change",renderDiscoveries);
  $("settingsBtn").addEventListener("click",()=>$("settingsDialog").showModal());
  $("radiusSelect").value=String(state.radius);
  $("radiusSelect").addEventListener("change",e=>{state.radius=Number(e.target.value);$("radiusLabel").textContent=`Unlock radius: ${state.radius} m`;saveState();renderDiscoveries();maybeAutoCollect();});
  $("autoCollect").checked=state.autoCollect;
  $("autoCollect").addEventListener("change",e=>{state.autoCollect=e.target.checked;saveState();toast(state.autoCollect?"Automatic collection enabled":"Automatic collection paused");});
  $("exportBtn").addEventListener("click",exportJournal);
  $("observeBtn").addEventListener("click",()=>{state.observeDone=true;saveState();toast("Mission complete — Observation Scout badge earned!");});
  $("legendTipBtn").addEventListener("click",()=>$("legendTip").hidden=!$("legendTip").hidden);
  $("clearDataBtn").addEventListener("click",()=>{
    if(!confirm("Clear all collected cards and mission progress from this device? This cannot be undone unless you exported your journal."))return;
    state={collected:[],radius:DEFAULT_RADIUS,autoCollect:true,observeDone:false,quizBestScore:null,quizAttempts:0,quizCompleted:false,profile:"Explorer"};saveState();
    $("radiusSelect").value=String(DEFAULT_RADIUS);$("autoCollect").checked=true;$("radiusLabel").textContent=`Unlock radius: ${DEFAULT_RADIUS} m`;renderDiscoveries();$("settingsDialog").close();toast("Local progress cleared.");
  });
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
  $("installBtn").addEventListener("click",async()=>{
    if(!deferredInstall){toast("In Chrome on Android, use the menu → Install app / Add to Home screen.");return;}
    deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;
  });
  window.addEventListener("appinstalled",()=>toast("World Hunter installed — happy exploring!"));
  if("serviceWorker" in navigator && location.protocol!=="file:")window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker",e)));
  $("radiusLabel").textContent=`Unlock radius: ${state.radius} m`;
  renderDiscoveries();renderCounts();renderJournal();renderMissions();
})();