// ================== CONFIG ==================
const REFRESH_MS = 1000; // cada 1 segundo
const grid = document.getElementById("grid");
const form = document.getElementById("form");
const nameInput = document.getElementById("name");
const ipInput = document.getElementById("ip");

// ================== HELPERS ==================

function createItem(cam) {
  const div = document.createElement("div");
  div.className = "item " + (cam.online ? "ok" : "fail");

  div.innerHTML = `
    <div class="circle"></div>
    <div class="name">${cam.name}</div>
    <div class="ip">${cam.ip}</div>
    <div class="meta">
      ${cam.online ? "Online" : "Offline"}
      ${cam.last_seen ? `<br>Último OK: ${cam.last_seen}` : ""}
    </div>
  `;

  return div;
}

// ================== RENDER ==================

let lastRender = {};

function render(cameras) {
  const newRender = {};

  cameras.forEach(cam => {
    newRender[cam.ip] = cam.online;
  });

  // solo redibujar si hay cambios reales
  const changed =
    Object.keys(newRender).length !== Object.keys(lastRender).length ||
    Object.keys(newRender).some(ip => lastRender[ip] !== newRender[ip]);

  if (!changed) return;

  grid.innerHTML = "";
  cameras.forEach(cam => {
    grid.appendChild(createItem(cam));
  });

  lastRender = newRender;
}

// ================== FETCH STATUS ==================

async function updateStatus() {
  try {
    const r = await fetch("/api/status", { cache: "no-store" });
    if (!r.ok) return;

    const data = await r.json();
    render(data);
  } catch (e) {
    // silencio: si cae un request no rompemos la UI
  }
}

// ================== FORM ==================

form.addEventListener("submit", async e => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const ip = ipInput.value.trim();
  if (!ip) return;

  try {
    const r = await fetch("/api/ips", { cache: "no-store" });
    const list = r.ok ? await r.json() : [];

    list.push({ name, ip });

    await fetch("/api/ips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list)
    });

    nameInput.value = "";
    ipInput.value = "";

    updateStatus(); // refresco inmediato
  } catch (e) {}
});

// ================== LOOP ==================

updateStatus();
setInterval(updateStatus, REFRESH_MS);

