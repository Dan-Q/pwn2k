// Convenience methods
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

// RNGs
let localRng = new Math.seedrandom();
let globalRng;

// Connect to Feathers
const socket = io('http://localhost:3030');
const app = feathers();
app.configure(feathers.socketio(socket));

// Get the messages service that talks to the server
const messages = app.service('messages');

// HTML escaping
function escapeHtml(str) {
  let div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Fisher-Yates shuffle
function shuffle(array, randomFunction = localRng){
  let m = array.length, t, i;
  while (m) {
    i = Math.floor(randomFunction() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}

function deleteAllCookies(){
  document.cookie.split(";").forEach(function(c) { document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); });
}

// Get (or generate) a unique identifier for "me"
function getOrGenerateId(){
  let result;
  if(/^id=\d+\-[0-9a-f]+$/.test(document.cookie)){
    result = document.cookie.slice(3);
  } else {
    // Delete existing cookies
    document.cookie.split(";").forEach(function(c) { document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); });
    // Create new random id
    let arr = new Uint8Array(20);
    window.crypto.getRandomValues(arr);
    result = `${(new Date()).getTime()}-` + Array.from(arr, (dec)=>`0${dec.toString(16).substr(-2)}`).join('');
  }
  document.cookie = `id=${result}`;
  return result;
}
const id = getOrGenerateId();
console.log(`My ID: ${id}`);

let idLoggedIn = false;
let gameState = 'setup';
let myMode = 'loading';
let players = new Map();
let catchingUp = true; // are we handling messages in catch-up mode?
let deck;
let systems = [[], [], [], [], [], [], [], []];
let connections = [[[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]],
                   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]],
                   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]],
                   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]],
                   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]],
                   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]],
                   [[false, false], [false, false], [false, false], [false, false], [false, false], [false, false], [false, false]]]

function me(){
  const player = players.get(id);
  if(!player){ deleteAllCookies(); window.location.href = 'missing-id.html'; }
  return player;
}

function handleMessage(message){
  console.log(message);
  if(message.type == 'log-in'){
    if(message.id == id) idLoggedIn = true; // if I see my own ID logging in, I'm logged-in!
    let newPlayer = { id: message.id };
    newPlayer.mode = ((Array.from(players.values()).filter(p=>p.mode=='network').length == 0) ? 'network' : 'hacker'); // first player is the network screen
    players.set(message.id, newPlayer);
    if(!catchingUp) renderPlayerList();
  } else if(message.type == 'game-state'){
    gameState = message.state;
  } else if(message.type == 'seed-rng'){
    globalRng = new Math.seedrandom(message.seed);
  } else if(message.type == 'add-system'){
    systems[message.x][message.y] = message.system;
    if(!catchingUp) renderSystem(message.x, message.y);
  } else if(message.type == 'update-connections'){
    connections = message.connections;
    if(!catchingUp) renderConnections();
  } else if(message.type == 'set-deck'){
    deck = message.deck;
    if(!catchingUp) renderConnections();
  } else if(message.type == 'set-hacker-attributes'){
    const hacker = players.get(message.id);
    if(!hacker) return;
    for(let [prop, value] of new Map(message.attributes)) hacker[prop] = value;
    if(!catchingUp) renderPlayerList();
  } else {
    console.log('unidentified message', message);
  }
}

function setup(){
  if(myMode == 'network'){
    if(gameState == 'setup'){
      // I am the network; it's my job to set up the game!
      (async ()=>{
        // Synchronise a global RNG
        const globalRngSeed = Math.seedrandom();
        await messages.create({ type: 'seed-rng', seed: globalRngSeed });
        // Get and shuffle deck
        deck = await fetch('deck.json').then(r=>r.json());
        deck = shuffle(deck);
        console.log('Loading deck:', deck);
        // Get initial cards into play - we need 5 systems of which at least one must be an easy indial, so we cycle the deck 'til we find some
        let initialSystems = [];
        while(initialSystems.length < 5){
          const draw = deck.shift();
          const haveAnIndial = initialSystems.find(s=>s.tags.includes('indial'));
          if((draw.type == 'system') && (haveAnIndial || draw.system.tags.includes('indial'))){ // we require 1+ indials
            // looks good - add to initialSystems
            initialSystems.push(draw.system);
          } else {
            // return to bottom of deck
            deck.push(draw);
          }
        }
        initialSystems = shuffle(initialSystems); // re-order initial systems so the indial isn't ALWAYS top-left
        console.log('Initial network draw:', initialSystems);
        // Place initial systems on the board with full connections between them
        await messages.create({ type: 'add-system', system: initialSystems.shift(), x: 3, y: 3 }); // pattern:
        await messages.create({ type: 'add-system', system: initialSystems.shift(), x: 3, y: 4 }); //
        await messages.create({ type: 'add-system', system: initialSystems.shift(), x: 4, y: 3 }); // a-b
        await messages.create({ type: 'add-system', system: initialSystems.shift(), x: 4, y: 4 }); // | |
        await messages.create({ type: 'add-system', system: initialSystems.shift(), x: 5, y: 4 }); // c-d-e
        connections[3][3][0] = true; // a-to-b
        connections[3][3][1] = true; // a-to-c
        connections[3][4][1] = true; // b-to-d
        connections[4][3][0] = true; // c-to-d
        connections[4][4][0] = true; // d-to-e
        await messages.create({ type: 'update-connections', connections: connections });
        // TODO: ensure a further indial is placed close to the top of the deck
        // Share deck state with other players
        await messages.create({ type: 'set-deck', deck: deck });
        // Wait a moment for messages to propogate, then change state of game
        setTimeout(async ()=>{ await messages.create({ type: 'game-state', state: 'paused' }); }, 150);
      })();
    }
  }
}

// Hacker: renders a dropdown of systems to choose from
function renderSystemDropdown(){
  let systemsForDropdown = new Map();
  for(let y = 0; y < 8; y++){
    for(let x = 0; x < 8; x++){
      if(systems[x][y]) systemsForDropdown.set(systems[x][y].name, { location: `${y}${x}`, style: systems[x][y].style });
    }
  }
  const previousValue = $('#hacker-net-system-select').value;
  $('#hacker-net-system-select').innerHTML = Array.from(systemsForDropdown).sort().map(sysInfo => `
    <option id="hacker-net-system-select-${sysInfo[1].location}" value="${sysInfo[1].location}" data-style="${sysInfo[1].style}">${sysInfo[0]}</option>
  `.trim()).join("\n");
  $('#hacker-net-system-select').value = (previousValue ? previousValue : systemsForDropdown.keys()[0]);
  renderSystemSelectedByDropdown();
}


// Hacker: renders the system selected by the dropdown
function renderSystemSelectedByDropdown(){
  for(let systemToHide of Array.from($$(`.hacker-net-system`))) systemToHide.classList.remove('active');
  let selectedSystemLocation = $('#hacker-net-system-select').value;
  if(!selectedSystemLocation) return;
  $(`.hacker-net-system-${selectedSystemLocation}`).classList.add('active');
  $('#hacker-net-system-select').style = $(`#hacker-net-system-select option#hacker-net-system-select-${selectedSystemLocation}`).dataset['style'];
}

function renderSystem(x, y){
  const system = systems[x][y];
  if(myMode == 'network'){
    // network view of a system
    const node = $(`.network-map-system-${y}${x}`);
    if(!node) return;
    if(!system) { node.innerHTML = ''; return; }
    node.innerHTML = `
      <div class="system" style="${system.style}">
        <div class="system-name">${system.name}</div>
        ${system.tags.includes('indial') ? '<i class="fas fa-phone-square fa-2x"></i>' : ''}
      </div>
    `;
  } else {
    // hacker view of a system
    const node = $(`.hacker-net-system-${y}${x}`);
    if(!node) return;
    if(!system) { node.innerHTML = ''; return; }
    node.innerHTML = `
      <div class="system">
        <p>${system.flavour}</p>
        ${system.tags.includes('indial') ? '<p><i class="fas fa-phone-square"></i> <strong>Indial</strong>: connect directly from your rig</p>' : ''}
        <ul class="connections">connections will go here</ul>
      </div>
    `;
  }
}

function renderConnections(){
  for(let y = 0; y < 7; y++){
    for(let x = 0; x < 7; x++){
      const cellA = $(`.network-map-connection-${x}${y}a`)
      const connectedA = connections[x][y][0];
      const cellB = $(`.network-map-connection-${x}${y}b`)
      const connectedB = connections[x][y][1];
      if(cellA) cellA.innerHTML = connectedA ? '<div class="connection"></div>' : '';
      if(cellB) cellB.innerHTML = connectedB ? '<div class="connection"></div>' : '';
    }
  }
}

function renderNetwork(){
  for(let y = 0; y < 8; y++){
    for(let x = 0; x < 8; x++){
      renderSystem(x, y);
    }
  }
  if(myMode == 'hacker') renderSystemDropdown();
  renderConnections();
}

function renderPlayerList(){
  if (myMode == 'network') {
    let htmlPlayers = [];
    for(player of players.values()){ if(player.name) htmlPlayers.push(player); }
    htmlPlayers.sort((a,b)=>(a.cred||0)<(b.cred||0) ? 1 : -1);
    htmlPlayers = htmlPlayers.map(player => `<tr><td>${player.name}</td><td>${player.cred || 0}</td></tr>`);
    $('.network-players-list').innerHTML = htmlPlayers.join("\n");
  } else if (myMode == 'hacker') {
    // do I need to provide my name?
    if((me().name || '') == '') {
      $('#modal-identity').classList.add('active');  // show identity dialog
      $('#hacker-name').focus();                     // focus name field
    } else {
      $('#modal-identity').classList.remove('active'); // don't show identity dialog
      hackerSwitchToTab('rig'); // switch to rig tab
    }
  }
}

function renderFull(){ // TODO: consider making this a Promise so we can chain it
  // render network.html / hacker.html as appropriate
  console.log(`renderFull() with mode ${myMode}`);
  fetch(`${myMode}.html`).then(d=>d.text()).then(d=>{
    $('main').innerHTML = d;
    if(myMode == 'network'){
      $('.join-game-url').innerText = window.location.href;
    }
    renderNetwork();
    renderPlayerList();
    setupHandlers();
  });
}

// Handle any future messages
messages.on('created', message => handleMessage(message));
// Handle all existing messages (synchronously, to prevent double-logging-in)
(async ()=>{
  console.log(' - catching up -');
  messageLog = await messages.find({ query: { $sort: { createdAt: 1 } } });
  for(message of messageLog) handleMessage(message);
  console.log(' - done catching up -');
  catchingUp = false;

  // If we're not already logged in, log in
  if(!idLoggedIn) await messages.create({ type: 'log-in', id: id, userAgent: navigator.userAgent });
  myMode = me().mode;
  $('body').classList.add(myMode);
  setup();
  renderFull();
})();

function hackerSwitchToTab(tabName){
  for(tab of Array.from($$('.tab-item, .tabbed-section'))) tab.classList.remove('active');
  for(tab of Array.from($$(`#hacker-${tabName}, #tab-hacker-${tabName}`))) tab.classList.add('active');
}

function setupHandlers(){
  if(myMode == 'hacker'){
    // Set name
    $('#submit-hacker-name').addEventListener('pointerup', async ()=>{
      const newName = escapeHtml($('#hacker-name').value.trim());
      if(newName == '') return;
      await messages.create({ type: 'set-hacker-attributes', id: id, attributes: [['name', newName]] });
      hackerSwitchToTab('rig'); // switch to rig tab
    });
    // Switch tab
    for(link of Array.from($$('a[data-tab]'))){
      link.addEventListener('pointerdown', e=>{
        hackerSwitchToTab(e.currentTarget.dataset['tab']);
      });
    }
    // Switch selected system
    $('#hacker-net-system-select').addEventListener('change', renderSystemSelectedByDropdown);
  }
}
