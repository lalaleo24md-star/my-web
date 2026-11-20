import base64
import io
import os
from typing import Any
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import httpx
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PROVIDER_ENDPOINTS = {
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
    "deepseek": "https://api.deepseek.com/chat/completions",
    "together": "https://api.together.xyz/v1/chat/completions",
    "gemini_openai": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
}


def parse_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080")
    origins = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:8080"]


def parse_debug_flag() -> bool:
    return os.getenv("FLASK_DEBUG", "false").strip().lower() in ("1", "true", "yes", "on")


ALLOWED_ORIGINS = parse_allowed_origins()
DEBUG_MODE = parse_debug_flag()

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024

CORS(
    app,
    resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
    allow_headers=["Content-Type", "X-API-Key"],
    methods=["POST", "OPTIONS"],
)


@app.get("/")
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")


def shrink_image_data_url(data_url: str, max_side: int = 1024, quality: int = 75) -> str:
    if not isinstance(data_url, str) or not data_url.strip():
        return ""
    if "," not in data_url:
        return data_url
    _, b64_part = data_url.split(",", 1)
    try:
        raw = base64.b64decode(b64_part)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return data_url


def resolve_endpoint(provider: str, custom_base_url: str) -> str:
    if custom_base_url:
        url = custom_base_url.strip().rstrip("/")
        if url.endswith("/chat/completions"):
            return url
        if url.endswith("/v1") or url.endswith("/openai"):
            return f"{url}/chat/completions"
        return f"{url}/v1/chat/completions"
    return PROVIDER_ENDPOINTS.get(provider, PROVIDER_ENDPOINTS["groq"])


def extract_reply_text(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    msg = choices[0].get("message") if isinstance(choices[0], dict) else {}
    if not isinstance(msg, dict):
        return ""

    content = msg.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()

    if isinstance(content, list):
        texts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                texts.append(item["text"])
        joined = "\n".join(t.strip() for t in texts if t.strip())
        if joined:
            return joined

    for alt_key in ("reasoning_content", "reasoning"):
        alt_val = msg.get(alt_key)
        if isinstance(alt_val, str) and alt_val.strip():
            return alt_val.strip()

    return ""


@app.post("/api/chat")
def chat_endpoint():
    api_key = (request.headers.get("X-API-Key") or "").strip()
    if not api_key:
        return jsonify({"detail": "กรุณาวาง API Key บนหน้าแอพก่อนส่งคำถาม"}), 401

    req = request.get_json(silent=True) or {}
    provider = (req.get("provider") or "groq").strip().lower()
    custom_base_url = (req.get("custom_base_url") or "").strip()
    model = (req.get("model") or "qwen/qwen3.8-27b").strip()
    board = (req.get("board") or "ESP32 DevKit (30/38 pin)").strip()
    board_family = (req.get("board_family") or "ESP32").strip()
    project_note = (req.get("project_note") or "").strip()
    pins = req.get("pins") or []
    history = req.get("history") or []
    prompt = (req.get("prompt") or "ช่วยตรวจสอบรูปภาพนี้และให้คำแนะนำที่จำเป็น").strip()
    image_data_url = req.get("image_data_url")
    reasoning_effort = (req.get("reasoning_effort") or "low").strip()

    pins_text = ", ".join(f"{p.get('pin')}={p.get('usage')}" for p in pins if isinstance(p, dict)) or "ยังไม่มี"

    system_prompt = (
        "คุณคือวิศวกรผู้เชี่ยวชาญด้านไมโครคอนโทรลเลอร์และระบบสมองกลฝังตัว "
        "รองรับ ESP32 (ทุกรุ่น/รุ่นย่อย เช่น DevKit, S2, S3, C3, C6, H2, CAM), "
        "ESP8266 (ทุกรุ่น/รุ่นย่อย เช่น NodeMCU v1/v2/v3, Wemos D1 Mini, ESP-01, ESP-12E/F), "
        "และ Arduino (ทุกรุ่น/รุ่นย่อยทั้งหมด เช่น Uno R3/R4 WiFi/Minima, Nano, Nano Every, Nano 33 IoT/BLE/RP2040, Mega 2560, Micro, Leonardo, Due, MKR series)\n"
        "ตอบเป็นภาษาไทยที่กระชับ ชัดเจน เรียงลำดับเป็นข้อๆ ห้ามเกริ่นยืดเยื้อ และห้ามพูดซ้ำคำเดิม\n"
        "รูปแบบการเรียงคำตอบที่ต้องใช้ให้สม่ำเสมอ:\n"
        "- สรุปสั้นๆ / จุดที่พบ: 1-3 บรรทัด ตรงประเด็น\n"
        "- การต่อสาย / ขาใช้งาน (ถ้ามี): ระบุชื่อขาจริงตามรุ่นบอร์ด แรงดันไฟ (3.3V / 5V) และสัญญาณ\n"
        "- โค้ด: ใส่ในบล็อก ```cpp ... ``` หรือ ```python ... ``` เท่านั้น และอธิบายสั้นๆ เฉพาะจุดสำคัญ\n"
        "- ข้อควรระวัง: ระบุเฉพาะเรื่องที่เสี่ยงจริง เช่น logic level, strapping pin, ADC, UART/I2C/SPI/PWM, Flash pin หรือ delay() ที่ขวาง Wi-Fi/BLE/MQTT และเตือนให้ตรวจ datasheet ก่อนจ่ายไฟจริง\n"
        "กฎเข้มงวด:\n"
        "1. ยึดตามรุ่นบอร์ด/รุ่นย่อยและโน้ตโปรเจกต์เสมอ ห้ามเดาขาข้ามรุ่นโดยไม่ระบุ\n"
        "2. หลีกเลี่ยงการใช้ delay() ยาวๆ ในงาน Wi-Fi/BLE/MQTT/เซนเซอร์หลายตัว\n"
        f"\nกลุ่มบอร์ด: {board_family}"
        f"\nรุ่น/รุ่นย่อยปัจจุบัน: {board}"
        f"\nขาที่บันทึกไว้ในโปรเจกต์: {pins_text}"
        f"\nโน้ตโปรเจกต์: {project_note or 'ไม่มี'}"
    )

    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]

    if isinstance(history, list):
        for msg in history[-6:]:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role")
            content = msg.get("text")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content[:2000]})

    shrunk_url = shrink_image_data_url(image_data_url) if image_data_url else ""
    if shrunk_url:
        user_content: Any = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": shrunk_url}},
        ]
    else:
        user_content = prompt

    messages.append({"role": "user", "content": user_content})

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 2048,
    }

    if provider == "groq" and "qwen3.8" in model.lower():
        if reasoning_effort in ("none", "low", "medium", "high"):
            payload["reasoning_effort"] = reasoning_effort

    endpoint = resolve_endpoint(provider, custom_base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(endpoint, headers=headers, json=payload)
    except httpx.TimeoutException:
        return jsonify({"detail": "การเชื่อมต่อ API ใช้เวลานานเกินกำหนด (Timeout) ลองลด reasoning effort หรือลองใหม่อีกครั้ง"}), 504
    except httpx.RequestError as exc:
        return jsonify({"detail": f"เชื่อมต่อ API ไม่สำเร็จ: {exc}"}), 502

    if resp.status_code == 401:
        return jsonify({"detail": "API Key ไม่ถูกต้องหรือหมดอายุ (401)"}), 401
    if resp.status_code == 429:
        return jsonify({"detail": "โควตาชั่วคราวเต็ม (Rate Limit 429) รอสักครู่แล้วลองใหม่"}), 429
    if resp.status_code == 413:
        return jsonify({"detail": "ข้อมูลหรือรูปภาพใหญ่เกินโควตาต่อรอบ (413)"}), 413
    if resp.status_code >= 400:
        err_preview = resp.text[:400] if resp.text else "ไม่พบรายละเอียดข้อผิดพลาด"
        return jsonify({"detail": f"API คืนค่าผิดพลาด ({resp.status_code}): {err_preview}"}), resp.status_code

    try:
        data = resp.json()
    except ValueError:
        return jsonify({"detail": f"คำตอบจาก API ไม่ใช่ JSON ที่ถูกต้อง: {resp.text[:250]}"}), 502

    reply = extract_reply_text(data)
    if not reply:
        return jsonify({"detail": f"โมเดลไม่ได้ส่งข้อความตอบกลับ (ตรวจสอบชื่อ Model: {model})"}), 502

    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=DEBUG_MODE)

