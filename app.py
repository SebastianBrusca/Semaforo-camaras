from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
import threading
import subprocess
import json
import os
import time
import signal

print(">>> APP FILE:", os.path.abspath(__file__))

APP_PORT = 8080
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
IPS_FILE = os.path.join(DATA_DIR, "ips.json")

app = Flask(__name__)

# ================== ESTADO GLOBAL ==================
CAMERA_STATE = {}
STATE_LOCK = threading.Lock()

# Ajustes del loop de ping
PING_TIMEOUT_MS = 400          # ms
PING_INTERVAL_SECONDS = 30.0    # segundos

# ================== ARCHIVOS ==================

def ensure_files():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(IPS_FILE):
        with open(IPS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)

def load_ips():
    ensure_files()
    try:
        with open(IPS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def save_ips(items):
    ensure_files()
    with open(IPS_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

# ================== PING WINDOWS ==================

def ping_windows(ip: str, timeout_ms: int = 1000):
    """
    Ping en Windows (modo estricto).
    """
    t0 = time.time()
    try:
        r = subprocess.run(
            ["ping", "-n", "1", "-w", str(timeout_ms), ip],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=False
        )

        out = (r.stdout or "").lower()
        ok = (
            (f"reply from {ip}".lower() in out) or
            (f"respuesta desde {ip}".lower() in out)
        ) and "ttl=" in out

    except Exception:
        ok = False

    rtt_ms = int((time.time() - t0) * 1000)
    return ok, rtt_ms

# ================== ESTADO SIMPLE (1 PING) ==================

def ensure_camera(ip: str):
    if ip not in CAMERA_STATE:
        CAMERA_STATE[ip] = {
            "online": False,
            "last_seen": None,
            "rtt": None,
            "updated_at": None
        }

# ================== LOOP EN SEGUNDO PLANO ==================

def ping_loop():
    """
    - Relee ips.json
    - Hace 1 ping por IP
    - Actualiza estado inmediato
    """
    while True:
        items = load_ips()
        ips = []

        for it in items:
            if isinstance(it, dict):
                ip = str(it.get("ip", "")).strip()
                if ip:
                    ips.append(ip)

        for ip in ips:
            try:
                ok, rtt = ping_windows(ip, timeout_ms=PING_TIMEOUT_MS)
                now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

                with STATE_LOCK:
                    ensure_camera(ip)
                    cam = CAMERA_STATE[ip]
                    cam["online"] = ok
                    cam["rtt"] = rtt
                    cam["updated_at"] = now_str
                    if ok:
                        cam["last_seen"] = now_str

            except Exception:
                pass

        # limpiar IPs eliminadas
        with STATE_LOCK:
            current = set(ips)
            to_delete = [ip for ip in CAMERA_STATE.keys() if ip not in current]
            for ip in to_delete:
                del CAMERA_STATE[ip]

        time.sleep(PING_INTERVAL_SECONDS)

# ================== API ==================

@app.get("/api/ips")
def api_get_ips():
    return jsonify(load_ips())

@app.post("/api/ips")
def api_set_ips():
    data = request.get_json(force=True, silent=True)
    if not isinstance(data, list):
        return jsonify({"error": "Formato inválido. Se espera una lista."}), 400

    cleaned = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip() or "Sin nombre"
        ip = str(item.get("ip", "")).strip()
        if ip:
            cleaned.append({"name": name, "ip": ip})

    save_ips(cleaned)
    return jsonify({"ok": True, "count": len(cleaned)})

@app.get("/api/status")
def api_status():
    items = load_ips()
    out = []

    with STATE_LOCK:
        for idx, item in enumerate(items, start=1):
            ip = str(item.get("ip", "")).strip()
            name = str(item.get("name", str(idx))).strip() or str(idx)

            if not ip:
                continue

            ensure_camera(ip)
            state = CAMERA_STATE[ip]

            out.append({
                "id": idx,
                "name": name,
                "ip": ip,
                "online": state["online"],
                "last_seen": state["last_seen"] or "Nunca",
                "rtt": state["rtt"],
                "updated_at": state["updated_at"]
            })

    return jsonify(out)

# ================== WEB ==================

@app.get("/")
def index():
    return send_from_directory("web", "index.html")

@app.get("/<path:path>")
def static_files(path):
    return send_from_directory("web", path)

# ================== SHUTDOWN ==================

@app.post("/api/shutdown")
def shutdown():
    os.kill(os.getpid(), signal.SIGTERM)
    return jsonify({"ok": True})

@app.get("/shutdown")
def shutdown_page():
    def do_shutdown():
        func = request.environ.get("werkzeug.server.shutdown")
        if func:
            func()
        else:
            os._exit(0)

    threading.Timer(0.5, do_shutdown).start()

    return """
    <html><head><meta charset="utf-8"><title>Cerrando...</title></head>
    <body style="font-family:system-ui;background:#0b0f14;color:#e6edf3;padding:30px;">
      <h2>⏻ Cerrando semáforo...</h2>
      <p>Podés cerrar esta pestaña.</p>
    </body></html>
    """

# ================== MAIN ==================

if __name__ == "__main__":
    ensure_files()
    threading.Thread(target=ping_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=APP_PORT, debug=False, use_reloader=False)




