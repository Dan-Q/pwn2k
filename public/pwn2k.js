// Connect to Feathers
const socket = io('http://localhost:3030');
const app = feathers();
app.configure(feathers.socketio(socket));

// Get the messages service that talks to the server
const messages = app.service('messages');

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
let players = new Map();

function me(){
  const player = players.get(id);
  if(!player){ deleteAllCookies(); window.location.reload(); }
  return player;
}

function handleMessage(message){
  if(message.type == 'log-in'){
    if(message.id == id) idLoggedIn = true; // if I see my own ID logging in, I'm logged-in!
    let newPlayer = { id: message.id };
    newPlayer.mode = ((players.size == 0) ? 'network' : 'hacker'); // first player is the network screen
    players.set(message.id, newPlayer);
    console.log('log-in', newPlayer);
  } else {
    console.log('unidentified message', message);
  }
}

// Handle any future messages
messages.on('created', message => handleMessage(message));
// Handle all existing messages (synchronously, to prevent double-logging-in)
(async ()=>{
  messageLog = await messages.find();
  for(message of messageLog) handleMessage(message);

  // If we're not already logged in, log in
  if(!idLoggedIn) messages.create({ type: 'log-in', id: id, userAgent: navigator.userAgent });
})()
