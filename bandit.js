<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🧀 CHEESE BANDIT999 🎰</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #000;
  color: #00ff41;
  font-family: 'Courier New', monospace;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  overflow-x: hidden;
}

.title {
  font-size: 3rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 30px;
  text-shadow: 0 0 20px #ffeb3b;
  animation: titleGlow 2s ease-in-out infinite;
}

@keyframes titleGlow {
  0%, 100% { 
    color: #ffeb3b;
    text-shadow: 0 0 20px #ffeb3b;
  }
  50% { 
    color: #ff00ff;
    text-shadow: 0 0 30px #ff00ff, 0 0 40px #00ffff;
  }
}

.machine-container {
  display: flex;
  gap: 40px;
  flex-wrap: wrap;
  justify-content: center;
}

.bandit-machine {
  position: relative;
  padding: 20px;
  border: 3px solid #00ff41;
  border-radius: 10px;
  background: rgba(0, 20, 0, 0.9);
  box-shadow: 0 0 30px rgba(0, 255, 65, 0.6);
  animation: machineGlow 3s ease-in-out infinite;
}

@keyframes machineGlow {
  0%, 100% {
    border-color: #00ff41;
    box-shadow: 0 0 30px rgba(0, 255, 65, 0.6);
  }
  33% {
    border-color: #ff00ff;
    box-shadow: 0 0 40px rgba(255, 0, 255, 0.8);
  }
  66% {
    border-color: #00ffff;
    box-shadow: 0 0 40px rgba(0, 255, 255, 0.8);
  }
}

.ascii-frame {
  font-size: 14px;
  line-height: 1.2;
  white-space: pre;
  text-align: center;
  margin-bottom: 15px;
  color: #00ff41;
  text-shadow: 0 0 10px currentColor;
}

.frame-top { animation: colorCycle1 4s infinite; }
.frame-mid { animation: colorCycle2 4s infinite; }
.frame-bot { animation: colorCycle3 4s infinite; }

@keyframes colorCycle1 {
  0%, 100% { color: #00ff41; }
  33% { color: #ff00ff; }
  66% { color: #00ffff; }
}

@keyframes colorCycle2 {
  0%, 100% { color: #ff00ff; }
  33% { color: #00ffff; }
  66% { color: #ffeb3b; }
}

@keyframes colorCycle3 {
  0%, 100% { color: #00ffff; }
  33% { color: #ffeb3b; }
  66% { color: #00ff41; }
}

.flicker-face {
  display: inline-block;
  animation: faceFlicker 1.5s infinite;
  font-size: 1.2em;
}

@keyframes faceFlicker {
  0%, 100% { content: '🎃'; }
  50% { content: '🤡'; }
}

.flicker-face::before {
  content: '🎃';
  animation: emojiSwap 1.5s infinite;
}

@keyframes emojiSwap {
  0%, 45% { content: '🎃'; }
  50%, 95% { content: '🤡'; }
}

.reels-container {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin: 20px 0;
}

.reel {
  width: 80px;
  height: 180px;
  border: 3px solid #ffeb3b;
  border-radius: 8px;
  background: #000;
  overflow: hidden;
  position: relative;
  box-shadow: 0 0 20px rgba(255, 235, 59, 0.6);
}

.reel-track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: translateY(0); }
  to { transform: translateY(-240px); }
}

.reel.stopped .reel-track {
  animation: none;
}

.symbol {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  border-bottom: 1px solid rgba(255, 235, 59, 0.3);
}

.symbol.top, .symbol.bottom {
  transform: scaleX(0.5);
  opacity: 0.6;
  font-size: 2rem;
}

.symbol.middle {
  transform: scaleX(1.8);
  font-size: 3rem;
  text-shadow: 0 0 15px currentColor;
}

.handle-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
  cursor: pointer;
}

.handle {
  font-size: 2rem;
  user-select: none;
  transition: transform 0.3s;
}

.handle:active {
  transform: translateY(20px);
}

.handle-shaft {
  font-size: 1.5rem;
  line-height: 1;
  color: #ffeb3b;
  text-shadow: 0 0 10px #ffeb3b;
}

.handle-ball {
  font-size: 2.5rem;
  color: #ff0000;
  animation: ballGlow 2s infinite;
}

@keyframes ballGlow {
  0%, 100% {
    text-shadow: 0 0 10px #ff0000;
  }
  50% {
    text-shadow: 0 0 20px #ff0000, 0 0 30px #ffeb3b;
  }
}

.status {
  text-align: center;
  font-size: 1.5rem;
  margin-top: 20px;
  color: #ffeb3b;
  text-shadow: 0 0 20px #ffeb3b;
  min-height: 40px;
}

/* === JACKPOT OVERLAY === */
#jackpot {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
}

.jackpot-text {
  font-size: 6rem;
  font-weight: bold;
  text-shadow: 0 0 40px #ff00ff, 0 0 80px #00ffff, 0 0 120px #ffeb3b;
  animation: jackpotPulse 1.2s infinite alternate;
  margin-bottom: 40px;
  z-index: 10;
}

@keyframes jackpotPulse {
  0% { 
    transform: scale(1);
    text-shadow: 0 0 40px #ff00ff;
  }
  100% { 
    transform: scale(1.15);
    text-shadow: 0 0 100px #ffeb3b, 0 0 140px #00ffff;
  }
}

.particle {
  position: absolute;
  font-size: 3rem;
  pointer-events: none;
  user-select: none;
  will-change: transform, opacity;
  animation: fall linear forwards;
}

@keyframes fall {
  0% {
    transform: translateY(-120vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(120vh) rotate(720deg);
    opacity: 0;
  }
}

.colon-animation {
  display: inline-block;
  animation: colonBlink 1s infinite;
}

@keyframes colonBlink {
  0%, 45% { opacity: 1; content: ':D'; }
  50%, 95% { opacity: 1; }
}

.colon-animation::before {
  content: ':D';
  animation: textFlicker 1s infinite;
}

@keyframes textFlicker {
  0%, 45% { content: ':D'; }
  50%, 95% { content: ':@D'; }
}

.controls {
  display: flex;
  gap: 20px;
  margin-top: 30px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  padding: 15px 30px;
  font-size: 1.2rem;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  border: 2px solid #00ff41;
  background: rgba(0, 255, 65, 0.2);
  color: #00ff41;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.3s;
  text-shadow: 0 0 5px currentColor;
}

.btn:hover {
  background: rgba(0, 255, 65, 0.4);
  box-shadow: 0 0 20px rgba(0, 255, 65, 0.8);
  transform: scale(1.05);
}

.btn:active {
  transform: scale(0.95);
}

@media (max-width: 768px) {
  .machine-container {
    flex-direction: column;
  }
  
  .title {
    font-size: 2rem;
  }
  
  .reels-container {
    gap: 10px;
  }
  
  .reel {
    width: 60px;
    height: 140px;
  }
  
  .symbol {
    height: 46px;
    font-size: 1.8rem;
  }
  
  .symbol.middle {
    font-size: 2.2rem;
  }
}
</style>
</head>
<body>

<div class="title">
  <span class="flicker-face"></span> CHEESE BANDIT999 <span class="flicker-face"></span>
</div>

<div class="machine-container">
  <!-- BANDIT MACHINE 1 -->
  <div class="bandit-machine">
    <div class="ascii-frame frame-top">╔═══════════════════╗
║ <span class="colon-animation"></span> BANDIT <span class="flicker-face"></span> 999 ║
╠═══════════════════╣</div>
    
    <div class="reels-container" id="reels1">
      <div class="reel" data-reel="0">
        <div class="reel-track"></div>
      </div>
      <div class="reel" data-reel="1">
        <div class="reel-track"></div>
      </div>
      <div class="reel" data-reel="2">
        <div class="reel-track"></div>
      </div>
    </div>
    
    <div class="ascii-frame frame-bot">╠═══════════════════╣
║ <span class="flicker-face"></span> <span class="colon-animation"></span> CHEESE <span class="colon-animation"></span> <span class="flicker-face"></span> ║
╚═══════════════════╝</div>
    
    <div class="handle-container" onclick="pullHandle(0)">
      <div class="handle-ball">●</div>
      <div class="handle-shaft">║<br>║<br>╱║╲</div>
    </div>
  </div>

  <!-- BANDIT MACHINE 2 -->
  <div class="bandit-machine">
    <div class="ascii-frame frame-mid">╔═══════════════════╗
║ <span class="flicker-face"></span> KING <span class="colon-animation"></span> SLOTS ║
╠═══════════════════╣</div>
    
    <div class="reels-container" id="reels2">
      <div class="reel" data-reel="0">
        <div class="reel-track"></div>
      </div>
      <div class="reel" data-reel="1">
        <div class="reel-track"></div>
      </div>
      <div class="reel" data-reel="2">
        <div class="reel-track"></div>
      </div>
    </div>
    
    <div class="ascii-frame frame-top">╠═══════════════════╣
║ <span class="colon-animation"></span> <span class="flicker-face"></span> SPLASH <span class="flicker-face"></span> <span class="colon-animation"></span> ║
╚═══════════════════╝</div>
    
    <div class="handle-container" onclick="pullHandle(1)">
      <div class="handle-ball">●</div>
      <div class="handle-shaft">║<br>║<br>╱║╲</div>
    </div>
  </div>

  <!-- BANDIT MACHINE 3 -->
  <div class="bandit-machine">
    <div class="ascii-frame frame-bot">╔═══════════════════╗
║ <span class="colon-animation"></span> <span class="flicker-face"></span> EMPIRE <span class="flicker-face"></span> ║
╠═══════════════════╣</div>
    
    <div class="reels-container" id="reels3">
      <div class="reel" data-reel="0">
        <div class="reel-track"></div>
      </div>
      <div class="reel" data-reel="1">
        <div class="reel-track"></div>
      </div>
      <div class="reel" data-reel="2">
        <div class="reel-track"></div>
      </div>
    </div>
    
    <div class="ascii-frame frame-mid">╠═══════════════════╣
║ <span class="flicker-face"></span> <span class="colon-animation"></span> OUIJI <span class="colon-animation"></span> <span class="flicker-face"></span> ║
╚═══════════════════╝</div>
    
    <div class="handle-container" onclick="pullHandle(2)">
      <div class="handle-ball">●</div>
      <div class="handle-shaft">║<br>║<br>╱║╲</div>
    </div>
  </div>
</div>

<div class="status" id="status">🌊🌊 PULL THE HANDLE! 🌊🌊</div>

<div class="controls">
  <button class="btn" onclick="spinAll()">🎰 SPIN ALL THREE!</button>
  <button class="btn" onclick="autoSpin()">⚡ AUTO SPIN</button>
</div>

<!-- JACKPOT OVERLAY -->
<div id="jackpot">
  <div class="jackpot-text">🌊🌊 JACKPOT!!! 🧀🤡🎰 🌊🌊</div>
</div>

<script>
// CHEESE EMOJI COLLECTION
const symbols = ['🧀', '🎃', '👑', '💰', '⚡', '🌊', '🤡', '💚', '🔥', '✨', '🎪', '🎭'];

// All the chaotic things that rain down in jackpot
const goodies = [
  '🧀','🧀','🧀','🧀',       // cheese heavy
  '🎃','🎃','🎃',
  '🤡','🤡',
  '💰','💰','💰','🪙','🪙',
  '💎','💎','🪙','🤑',
  '🍿','🍿','🍿','🍿','🎬',   // popcorn explosion!
  '⚡','🌊','💚','✨','🔥',
  ':D',':@D','👑','🫕','🥛'
];

let autoSpinning = false;
let autoSpinInterval = null;

// Create falling particle for jackpot
function createParticle() {
  const particle = document.createElement('div');
  particle.className = 'particle';
  particle.textContent = goodies[Math.floor(Math.random() * goodies.length)];
  
  // Random start position
  const x = Math.random() * window.innerWidth;
  particle.style.left = x + 'px';
  particle.style.top = '-100px';
  
  // Random size, rotation, delay & duration
  const size = 1.8 + Math.random() * 2.5;
  particle.style.fontSize = size + 'rem';
  particle.style.transform = `rotate(${Math.random()*360}deg)`;
  
  const duration = 3 + Math.random() * 4; // 3–7 seconds fall
  particle.style.animationDuration = duration + 's';
  particle.style.animationDelay = Math.random() * 0.6 + 's';
  
  document.getElementById('jackpot').appendChild(particle);
  
  // Remove after animation
  setTimeout(() => particle.remove(), duration * 1000 + 1000);
}

// Trigger jackpot explosion
function triggerJackpot() {
  const jackpotEl = document.getElementById('jackpot');
  jackpotEl.style.display = 'flex';
  
  // Massive burst
  for (let i = 0; i < 120; i++) {   // 120 particles
    setTimeout(createParticle, i * 30); // staggered burst
  }
  
  // Confetti-like second wave
  setTimeout(() => {
    for (let i = 0; i < 80; i++) {
      setTimeout(createParticle, i * 50);
    }
  }, 800);
  
  // Auto hide after ~12 seconds
  setTimeout(() => {
    jackpotEl.style.display = 'none';
    jackpotEl.innerHTML = '<div class="jackpot-text">🌊🌊 JACKPOT!!! 🧀🤡🎰 🌊🌊</div>';
  }, 12000);
}

// Check if all three symbols match (JACKPOT!)
function checkJackpot(machineIndex) {
  setTimeout(() => {
    const container = document.getElementById(`reels${machineIndex + 1}`);
    const reels = container.querySelectorAll('.reel');
    
    // Get the middle symbol from each reel
    const symbols = [];
    reels.forEach(reel => {
      const track = reel.querySelector('.reel-track');
      const middleSymbols = track.querySelectorAll('.symbol.middle');
      if (middleSymbols.length > 0) {
        // Get the visible middle symbol
        const symbol = middleSymbols[0].textContent;
        symbols.push(symbol);
      }
    });
    
    // Check if all 3 match
    if (symbols.length === 3 && symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
      // JACKPOT!!!
      setTimeout(() => {
        triggerJackpot();
        document.getElementById('status').innerHTML = `🎰💰 JACKPOT!!! ${symbols[0]} ${symbols[0]} ${symbols[0]} 💰🎰`;
      }, 500);
      return true;
    }
    
    return false;
  }, 2100);
}

// Initialize all machines
function initMachines() {
  for (let machine = 0; machine < 3; machine++) {
    const container = document.getElementById(`reels${machine + 1}`);
    const reels = container.querySelectorAll('.reel');
    
    reels.forEach(reel => {
      const track = reel.querySelector('.reel-track');
      createSymbols(track);
    });
  }
}

// Create symbols for a reel
function createSymbols(track) {
  track.innerHTML = '';
  // Create extended loop for smooth spinning
  for (let i = 0; i < 12; i++) {
    const symbolDiv = document.createElement('div');
    symbolDiv.className = 'symbol';
    
    // Determine if top, middle, or bottom
    const pos = i % 3;
    if (pos === 0) symbolDiv.classList.add('top');
    else if (pos === 1) symbolDiv.classList.add('middle');
    else symbolDiv.classList.add('bottom');
    
    symbolDiv.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    track.appendChild(symbolDiv);
  }
}

// Pull handle - spin one machine
function pullHandle(machineIndex) {
  const container = document.getElementById(`reels${machineIndex + 1}`);
  const reels = container.querySelectorAll('.reel');
  
  reels.forEach((reel, index) => {
    reel.classList.remove('stopped');
    
    setTimeout(() => {
      reel.classList.add('stopped');
      const track = reel.querySelector('.reel-track');
      createSymbols(track);
      
      // Position randomly
      const offset = -(Math.floor(Math.random() * 4) * 60);
      track.style.transform = `translateY(${offset}px)`;
    }, 1000 + (index * 300));
  });
  
  checkWin(machineIndex);
}

// Spin all three machines
function spinAll() {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => pullHandle(i), i * 500);
  }
}

// Auto spin
function autoSpin() {
  if (autoSpinning) {
    autoSpinning = false;
    clearInterval(autoSpinInterval);
    document.getElementById('status').innerHTML = '🛑 AUTO SPIN STOPPED!';
  } else {
    autoSpinning = true;
    document.getElementById('status').innerHTML = '🔄 AUTO SPINNING! 🌊🌊';
    
    autoSpinInterval = setInterval(() => {
      const randomMachine = Math.floor(Math.random() * 3);
      pullHandle(randomMachine);
    }, 2000);
  }
}

// Check for win
function checkWin(machineIndex) {
  // First check for jackpot
  const isJackpot = checkJackpot(machineIndex);
  
  if (!isJackpot) {
    setTimeout(() => {
      const messages = [
        '🧀 CHEESE KING! 🧀',
        '🎃 PUMPKING WINS! 👑',
        '💰 BIG WIN! 🌊🌊',
        '⚡ LIGHTNING STRIKE! ⚡',
        '🤡 CLOWN BONUS! :@D',
        '💚 HEART WINNER! 💚',
        '🔥 ON FIRE! 🔥',
        '✨ SPARKLE WIN! ✨',
        '🎪 CIRCUS PRIZE! 🎪',
        '🎭 DRAMA QUEEN! 🎭'
      ];
      
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      document.getElementById('status').innerHTML = randomMsg;
    }, 2000);
  }
}

// Initialize on load
initMachines();

// Keep spinning when not stopped
setInterval(() => {
  document.querySelectorAll('.reel:not(.stopped) .reel-track').forEach(track => {
    if (!track.parentElement.classList.contains('stopped')) {
      // Refresh symbols occasionally
      if (Math.random() < 0.1) {
        createSymbols(track);
      }
    }
  });
}, 2000);
</script>

</body>
</html>
