<script>
/* ================== CONFIG ================== */
const REFRESH_MS = 1000;
const grid = document.getElementById("grid");
const form = document.getElementById("form");
const nameInput = document.getElementById("name");
const ipInput = document.getElementById("ip");
const fullscreenBtn = document.getElementById("fullscreenBtn");

/* ================== MODAL CONFIRM ================== */
const confirmModal = document.getElementById("confirmModal");
const confirmText = document.getElementById("confirmText");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelBtn");
const confirmTitle = document.getElementById("confirmTitle");

let confirmResolve = null;

function showConfirm(title, message){
  confirmTitle.textContent = title;
  confirmText.textContent = message;
  confirmModal.classList.remove("hidden");
  return new Promise(resolve => confirmResolve = resolve);
}

confirmBtn.onclick = () => {
  confirmModal.classList.add("hidden");
  if (confirmResolve) confirmResolve(true);
};

cancelBtn.onclick = () => {
  confirmModal.classList.add("hidden");
  if (confirmResolve) confirmResolve(false);
};

/* ================== MODAL EDIT ================== */
const editModal = document.getElementById("editModal");
const editName = document.getElementById("editName");
const editIp = document.getElementById("editIp");
const editSaveBtn = document.getElementById("editSaveBtn");
const editCancelBtn = document.getElementById("editCancelBtn");

let editingCam = null;

editCancelBtn.onclick = () => {
  editModal.classList.add("hidden");
  editingCam = null;
};

/* ================== DRAG STATE ================== */
let dragSrcEl = null;
let isDragging = false;

/* ================== RENDER OPTIMIZATION ================== */
let lastRenderKey = "";

/* Armamos una “firma” del estado para saber si cambió algo */
function buildRenderKey(cameras){
  // include orden + estado online/offline + last_seen (si querés)
  return cameras.map(c => `${c.ip}:${c.online ? 1 : 0}:${c.last_seen || ""}`).join("|");
}

/* ================== RENDER ================== */
function render(cameras){
  const newKey = buildRenderKey(cameras);
  if (newKey === lastRenderKey) return; // ✅ no tocar DOM si no cambió
  lastRenderKey = newKey;

  grid.innerHTML = "";

  cameras.forEach(cam => {
    const div = document.createElement("div");
    div.className = "item " + (cam.online ? "ok" : "fail");
    div.setAttribute("draggable", "true");
    div.dataset.ip = cam.ip;

    div.innerHTML = `
      <div class="circle"></div>
      <div class="delete" title="Eliminar">✖</div>

      <div class="name">${cam.name}</div>
      <div class="ip">${cam.ip}</div>

      <div class="meta">
        ${cam.online ? "Online" : "Offline"}
        ${cam.last_seen ? `<br>Último OK: ${cam.last_seen}` : ""}
      </div>

      <button class="edit-btn" type="button">Editar</button>
    `;

    /* ===== ELIMINAR ===== */
    div.querySelector(".delete").onclick = async () => {
      const ok = await showConfirm("Eliminar cámara", `¿Eliminar la cámara ${cam.ip}?`);
      if (!ok) return;

      const r = await fetch("/api/ips", { cache: "no-store" });
      const list = r.ok ? await r.json() : [];

      await fetch("/api/ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(list.filter(i => i.ip !== cam.ip))
      });

      await actualizar(true); // force
    };

    /* ===== EDITAR ===== */
    div.querySelector(".edit-btn").onclick = () => {
      editingCam = cam;
      editName.value = cam.name;
      editIp.value = cam.ip;
      editModal.classList.remove("hidden");
    };

    /* ===== DRAG & DROP ===== */
    div.addEventListener("dragstart", (e) => {
      isDragging = true;                 // ✅ pausa refresh
      dragSrcEl = div;
      div.classList.add("dragging");

      // ✅ imprescindible para Firefox / consistencia
      e.dataTransfer.setData("text/plain", cam.ip);
      e.dataTransfer.effectAllowed = "move";
    });

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    div.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const srcIP = e.dataTransfer.getData("text/plain") || (dragSrcEl && dragSrcEl.dataset.ip);
      const targetIP = div.dataset.ip;

      if (!srcIP || !targetIP || srcIP === targetIP) return;

      await reorderIPs(srcIP, targetIP);
    });

    div.addEventListener("dragend", async () => {
      isDragging = false;                // ✅ reanuda refresh
      document.querySelectorAll(".item").forEach(i => i.classList.remove("dragging"));
      dragSrcEl = null;

      // refresco post-drag para que quede consistente
      await actualizar(true);
    });

    grid.appendChild(div);
  });
}

/* ================== REORDENAR ================== */
async function reorderIPs(srcIP, targetIP){
  try{
    const r = await fetch("/api/ips", { cache: "no-store" });
    const list = r.ok ? await r.json() : [];

    const srcIndex = list.findIndex(i => i.ip === srcIP);
    const targetIndex = list.findIndex(i => i.ip === targetIP);
    if (srcIndex < 0 || targetIndex < 0) return;

    const [moved] = list.splice(srcIndex, 1);
    list.splice(targetIndex, 0, moved);

    await fetch("/api/ips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list)
    });

    // forzamos update para re-render con el nuevo orden
    await actualizar(true);
  } catch(e){}
}

/* ================== EDIT SAVE ================== */
editSaveBtn.onclick = async () => {
  if (!editingCam) return;

  const r = await fetch("/api/ips", { cache: "no-store" });
  const list = r.ok ? await r.json() : [];

  const nuevaLista = list.map(i =>
    i.ip === editingCam.ip
      ? { name: editName.value.trim(), ip: editIp.value.trim() }
      : i
  );

  await fetch("/api/ips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nuevaLista)
  });

  editModal.classList.add("hidden");
  editingCam = null;

  await actualizar(true);
};

/* ================== STATUS ================== */
async function actualizar(force = false){
  // ✅ si estás arrastrando, NO tocar nada
  if (isDragging) return;

  try{
    const r = await fetch("/api/status", { cache: "no-store" });
    if (!r.ok) return;

    const data = await r.json();

    // si pedís force, resetea key para asegurar render
    if (force) lastRenderKey = "";
    render(data);
  } catch(e){}
}

/* ================== FORM ================== */
form.onsubmit = async (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const ip = ipInput.value.trim();
  if (!ip) return;

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

  await actualizar(true);
};

/* ================== CERRAR SEMÁFORO ================== */
document.getElementById("shutdown-btn").onclick = async () => {
  const ok = await showConfirm("Cerrar semáforo", "¿Seguro que querés cerrar el semáforo?");
  if (ok) location.href = "/shutdown";
};

/* ================== FULLSCREEN ================== */
fullscreenBtn.onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    fullscreenBtn.textContent = "⛶ Salir de pantalla completa";
  } else {
    document.exitFullscreen();
    fullscreenBtn.textContent = "⛶ Pantalla completa";
  }
};

/* ================== LOOP ================== */
actualizar(true);
setInterval(actualizar, REFRESH_MS);
</script>
