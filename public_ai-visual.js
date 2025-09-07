console.log("AI neural web visual loaded.");

// === Canvas Setup ===
const canvas = document.createElement('canvas');
canvas.id = 'ai-canvas';
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.zIndex = '0'; // behind chat UI
canvas.style.pointerEvents = 'none';
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');
let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

// === Neural Node Setup ===
const nodes = [];
const NODE_COUNT = 50;
const shardColors = {}; // color per shard dynamically assigned
for (let i = 0; i < NODE_COUNT; i++) {
  nodes.push({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    radius: Math.random() * 3 + 2,
    shard: 'default'
  });
}

// === Assign shard color dynamically ===
function getShardColor(shard) {
  if (!shardColors[shard]) {
    // generate a pastel color for new shard
    shardColors[shard] = `hsl(${Math.floor(Math.random()*360)}, 70%, 60%)`;
  }
  return shardColors[shard];
}

// === Draw Nodes and Connections ===
function draw() {
  ctx.clearRect(0, 0, width, height);
  
  // Move nodes
  nodes.forEach(n => {
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < 0 || n.x > width) n.vx *= -1;
    if (n.y < 0 || n.y > height) n.vy *= -1;
  });

  // Draw connections
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 150) {
        const alpha = 1 - dist / 150;
        ctx.strokeStyle = `rgba(255,255,255,${alpha*0.2})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }

  // Draw nodes
  nodes.forEach(n => {
    ctx.fillStyle = getShardColor(n.shard || 'default');
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI*2);
    ctx.fill();
  });

  requestAnimationFrame(draw);
}
draw();

// === React to Chat Activity ===
const ws = new WebSocket(`ws://${location.host}`);

// Helper to pulse nodes of a specific shard
function pulseNodes(shard = 'default') {
  nodes.forEach(n => {
    if (n.shard === shard || shard === 'default') {
      n.radius += Math.random() * 2 + 1;
      setTimeout(() => { n.radius = Math.random() * 3 + 2; }, 200);
    }
  });
}

// Handle incoming AI messages
ws.onmessage = (msg) => {
  console.log('AI message:', msg.data);

  // Parse shard from message if formatted like "shard:tech|Hello"
  let shard = 'default';
  let content = msg.data;
  const match = content.match(/^shard:(\w+)\|(.+)/);
  if (match) {
    shard = match[1];
    content = match[2];
  }

  // Assign some nodes to this shard for visualization
  nodes.forEach(n => {
    if (Math.random() < 0.2) n.shard = shard;
  });

  pulseNodes(shard);
};

// Also react to user sending message
const input = document.getElementById('message');
const sendBtn = document.getElementById('send-btn');

sendBtn.addEventListener('click', () => {
  // optional: assign random nodes to user's shard for visual feedback
  const shard = 'default';
  nodes.forEach(n => { if (Math.random() < 0.1) n.shard = shard; });
  pulseNodes(shard);
});

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const shard = 'default';
    nodes.forEach(n => { if (Math.random() < 0.1) n.shard = shard; });
    pulseNodes(shard);
  }
});

// === Ensure Chat Box Stays Centered ===
const chatContainer = document.getElementById('chat-container');
chatContainer.style.position = 'relative';
chatContainer.style.zIndex = '1'; // above canvas