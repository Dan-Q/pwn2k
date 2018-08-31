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

function me(){
  const player = players.get(id);
  if(!player){ deleteAllCookies(); window.location.href = 'missing-id.html'; }
  return player;
}

function handleMessage(message){
  console.log('Message: ', message);
  if(message.type == 'log-in'){
    if(message.id == id) idLoggedIn = true; // if I see my own ID logging in, I'm logged-in!
    let newPlayer = { id: message.id };
    newPlayer.mode = ((players.size == 0) ? 'network' : 'hacker'); // first player is the network screen
    players.set(message.id, newPlayer);
    console.log('log-in', newPlayer);
  } else if(message.type == 'game-state'){
    gameState = message.state;
  } else if(message.type == 'seed-rng'){
    globalRng = new Math.seedrandom(message.seed);
    console.log('globalRng() seeded')
  } else if(message.type == 'add-system'){
    systems[message.x][message.y] = message.system;
    renderSystem(message.x, message.y);
    renderConnections();
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
        messages.create({ type: 'seed-rng', seed: globalRngSeed });
        // Get and shuffle deck
        deck = await fetch('deck.json').then(r=>r.json());
        deck = shuffle(deck);
        console.log('Loading deck:', deck);
        // TODO: get initial cards into play - we need 5 systems of which at least one must be an easy indial, so we cycle the deck 'til we find some
        let initialSystems = [];
        while(initialSystems.length < 5){
          let draw = deck.shift();
          if((draw.type == 'system') && true){ // TODO: add more criteria here
            // looks good - add to initialSystems
            initialSystems.push(draw.system);
          } else {
            // return to bottom of deck
            deck.push(draw);
          }
        }
        console.log('Initial network draw:', initialSystems);
        // TODO: place initial systems on the board
        messages.create({ type: 'add-system', system: initialSystems.shift(), x: 3, y: 3 }); // pattern:
        messages.create({ type: 'add-system', system: initialSystems.shift(), x: 3, y: 4 }); //
        messages.create({ type: 'add-system', system: initialSystems.shift(), x: 4, y: 3 }); // a b
        messages.create({ type: 'add-system', system: initialSystems.shift(), x: 4, y: 4 }); // c d e
        messages.create({ type: 'add-system', system: initialSystems.shift(), x: 5, y: 4 });
        // TODO: share deck state with other players
        // Wait a moment for messages to propogate, then change state of game
        // setTimeout(()=>{ messages.create({ type: 'game-state', state: 'paused' }); }, 150);
      })();
    }
  }
}

function renderSystem(x, y){
  const node = $(`.network-map-system-${y}${x}`);
  if(!node) return;
  const system = systems[x][y];
  if(!system) { node.innerHTML = ''; return; }
  node.innerHTML = `
    <div class="system" style="${system.style}">
      <div class="system-name">${system.name}</div>
      ${system.tags.includes('indial') ? '<i class="fas fa-phone-square fa-2x"></i>' : ''}
    </div>
  `;
}

function renderConnections(){
}

function renderNetwork(){
  for(let y = 0; y < 8; y++){
    for(let x = 0; x < 8; x++){
      renderSystem(x, y);
    }
  }
  renderConnections();
}

function renderFull(){
  // render network.html / hacker.html as appropriate
  fetch(`${myMode}.html`).then(d=>d.text()).then(d=>$('main').innerHTML=d);
  renderNetwork();
}

// Handle any future messages
messages.on('created', message => handleMessage(message));
// Handle all existing messages (synchronously, to prevent double-logging-in)
(async ()=>{
  messageLog = await messages.find();
  for(message of messageLog) handleMessage(message);
  catchingUp = false;

  // If we're not already logged in, log in
  if(!idLoggedIn) await messages.create({ type: 'log-in', id: id, userAgent: navigator.userAgent });
  myMode = me().mode;
  $('body').classList.add(myMode);
  setup();
  renderFull();
})();
