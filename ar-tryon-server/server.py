"""
Trendly AR Try-On Server  v4
==============================
Priority order:
  1. Replicate API  → IDM-VTON (photorealistic, no GPU needed)
  2. Local IDM-VTON → if installed at ./IDM-VTON/
  3. OpenCV fallback→ Haar cascade + Poisson clone

Setup:
  pip install -r requirements.txt

Run:
  python server.py

Set REPLICATE_API_TOKEN for AI quality results:
  Windows:  set REPLICATE_API_TOKEN=r8_xxxx
  Mac/Linux: export REPLICATE_API_TOKEN=r8_xxxx
"""

import base64, io, os, subprocess, sys, time, urllib.request, uuid
import cv2, numpy as np, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import replicate
    HAS_REPLICATE = True
except ImportError:
    HAS_REPLICATE = False

app = FastAPI(title="Trendly AR Try-On v4")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
LOCAL_VTON_PATH = os.path.join(os.path.dirname(__file__), "IDM-VTON")
LOCAL_VTON_INFERENCE = os.path.join(LOCAL_VTON_PATH, "inference.py")
LOCAL_VTON_CKPT = os.path.join(LOCAL_VTON_PATH, "ckpt")

def check_local_idm():
    if not os.path.isdir(LOCAL_VTON_PATH):
        return False, "IDM-VTON folder not found"
    if not os.path.isfile(LOCAL_VTON_INFERENCE):
        return False, "inference.py missing — did git clone complete?"
    if not os.path.isdir(LOCAL_VTON_CKPT) or not os.listdir(LOCAL_VTON_CKPT):
        return False, "checkpoints missing — download weights into IDM-VTON/ckpt/"
    return True, "ready"

LOCAL_IDM_OK, LOCAL_IDM_STATUS = check_local_idm()

print("─"*55)
print("  Trendly AR Try-On Server v4")
print("─"*55)
print(f"  {'✅' if REPLICATE_TOKEN else '⚠️ '} Replicate API: {'ACTIVE' if REPLICATE_TOKEN else 'NOT SET (optional — set REPLICATE_API_TOKEN)'}")
print(f"  {'✅' if LOCAL_IDM_OK else '⚠️ '} Local IDM-VTON: {LOCAL_IDM_STATUS}")
print("  ✅ OpenCV fallback: always available")
print("─"*55)
if not REPLICATE_TOKEN and not LOCAL_IDM_OK:
    print()
    print("  ⚠️  NO AI BACKEND ACTIVE — results will be OpenCV quality")
    print("  Fix option A (easiest): set REPLICATE_API_TOKEN")
    print("  Fix option B (local):   set up IDM-VTON checkpoints")
    print("─"*55)

CASCADE_PATH = os.path.join(os.path.dirname(__file__), "haarcascade_frontalface_default.xml")
def ensure_cascade():
    if not os.path.exists(CASCADE_PATH):
        url = "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml"
        urllib.request.urlretrieve(url, CASCADE_PATH)
ensure_cascade()
face_cascade = cv2.CascadeClassifier(CASCADE_PATH)

class TryOnRequest(BaseModel):
    person_image: str
    cloth_image: str

class TryOnResponse(BaseModel):
    result_image: str
    method: str

def decode_b64(data_url: str) -> np.ndarray:
    if "," in data_url: data_url = data_url.split(",", 1)[1]
    buf = np.frombuffer(base64.b64decode(data_url), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)
    if img is None: raise ValueError("Cannot decode image")
    return img

def encode_jpg(img: np.ndarray, quality=93) -> str:
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

def to_bgr(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2: return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4: return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    return img.copy()

def b64_to_bytes(data_url: str) -> bytes:
    if "," in data_url: data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)

# ── Backend 1: Replicate IDM-VTON ────────────────────────────────────────────
def tryon_replicate(person_b64: str, cloth_b64: str) -> str:
    if not HAS_REPLICATE: raise RuntimeError("pip install replicate")
    if not REPLICATE_TOKEN: raise RuntimeError("REPLICATE_API_TOKEN not set")
    import replicate as rep
    output = rep.run(
        "yisol/idm-vton:906425dbfd09fddcf5d4c8ef3f36ec7ebedf5d3ffa5ee45d4f4e8a0616c9b7ac",
        input={
            "human_img":  io.BytesIO(b64_to_bytes(person_b64)),
            "garm_img":   io.BytesIO(b64_to_bytes(cloth_b64)),
            "garment_des": "shirt",
            "is_checked": True,
            "is_checked_crop": False,
            "denoise_steps": 30,
            "seed": 42,
        }
    )
    with urllib.request.urlopen(str(output)) as resp:
        data = resp.read()
    return "data:image/png;base64," + base64.b64encode(data).decode()

# ── Backend 2: Local IDM-VTON ─────────────────────────────────────────────────
def tryon_local_idm(person_b64: str, cloth_b64: str) -> str:
    tmp = os.path.join(os.path.dirname(__file__), "tmp")
    os.makedirs(tmp, exist_ok=True)
    uid = str(uuid.uuid4())[:8]
    pp = os.path.join(tmp, f"{uid}_person.jpg")
    cp = os.path.join(tmp, f"{uid}_cloth.jpg")
    op = os.path.join(tmp, f"{uid}_result.png")
    cv2.imwrite(pp, to_bgr(decode_b64(person_b64)))
    cv2.imwrite(cp, to_bgr(decode_b64(cloth_b64)))
    r = subprocess.run([sys.executable, os.path.join(LOCAL_VTON_PATH,"inference.py"),
        "--person", pp, "--cloth", cp, "--output", op],
        capture_output=True, text=True, timeout=120)
    if r.returncode != 0: raise RuntimeError(r.stderr[:500])
    with open(op, "rb") as f: data = f.read()
    for p in [pp, cp, op]:
        try: os.remove(p)
        except: pass
    return "data:image/png;base64," + base64.b64encode(data).decode()

# ── Backend 3: OpenCV fallback ────────────────────────────────────────────────
def detect_torso(p):
    H, W = p.shape[:2]
    gray = cv2.cvtColor(p, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(max(20,W//15), max(20,H//15)))
    if len(faces) > 0:
        fx,fy,fw,fh = sorted(faces, key=lambda f:f[2]*f[3], reverse=True)[0]
        cx = fx+fw//2
        bx = max(0, cx-int(fw*1.4)); by = max(0, fy+int(fh*1.75))
        bw = min(int(fw*2.8), W-bx); bh = min(int(fh*3.2), H-by)
        return bx,by,bw,bh
    bw=int(W*0.54); bh=int(H*0.58); bx=(W-bw)//2; by=int(H*0.17)
    return bx,by,bw,bh

def tryon_opencv(person_b64: str, cloth_b64: str) -> str:
    person = to_bgr(decode_b64(person_b64))
    cloth  = to_bgr(decode_b64(cloth_b64))
    H,W = person.shape[:2]
    if max(H,W) > 1024:
        s = 1024/max(H,W); person = cv2.resize(person,(int(W*s),int(H*s))); H,W=person.shape[:2]
    result = person.copy()
    bx,by,bw,bh = detect_torso(person)
    ch,cw = cloth.shape[:2]
    src = np.float32([[0,0],[cw,0],[cw,ch],[0,ch]]); dst = np.float32([[0,0],[bw,0],[bw,bh],[0,bh]])
    cloth_w = cv2.warpPerspective(cloth, cv2.getPerspectiveTransform(src,dst), (bw,bh), flags=cv2.INTER_LANCZOS4)
    roi = person[by:by+bh, bx:bx+bw]
    if roi.size > 0:
        s = cv2.cvtColor(cloth_w, cv2.COLOR_BGR2LAB).astype(np.float32)
        r = cv2.cvtColor(roi,     cv2.COLOR_BGR2LAB).astype(np.float32)
        s[:,:,0] = np.clip(s[:,:,0] + (r[:,:,0].mean()-s[:,:,0].mean())*0.55, 0,255)
        cloth_w = cv2.cvtColor(s.astype(np.uint8), cv2.COLOR_LAB2BGR)
    m = np.zeros((bh,bw),np.float32)
    cv2.ellipse(m,(bw//2,bh//2),(int(bw*0.39),int(bh*0.39)),0,0,360,1.,-1)
    k = max(3,int(min(bw,bh)*0.11*1.8)|1); m=cv2.GaussianBlur(m,(k,k),0)
    mask = (m*255).astype(np.uint8)
    try:
        c = (bx+bw//2,by+bh//2)
        if 0<c[0]<W and 0<c[1]<H: result=cv2.seamlessClone(cloth_w,result,mask,c,cv2.NORMAL_CLONE)
    except: pass
    return encode_jpg(result)

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status":"ok","server":"Trendly AR Try-On v4",
            "replicate_ready": bool(REPLICATE_TOKEN and HAS_REPLICATE),
            "local_idm_ready": LOCAL_IDM_OK,
            "local_idm_status": LOCAL_IDM_STATUS,
            "opencv_ready": True,
            "active_backend": (
                "replicate" if (REPLICATE_TOKEN and HAS_REPLICATE) else
                "local-idm-vton" if LOCAL_IDM_OK else
                "opencv-fallback"
            )}

@app.post("/tryon", response_model=TryOnResponse)
def tryon(req: TryOnRequest):
    errors = []
    if REPLICATE_TOKEN and HAS_REPLICATE:
        try:
            print("→ Replicate IDM-VTON...")
            r = tryon_replicate(req.person_image, req.cloth_image)
            print("✅ Replicate success")
            return TryOnResponse(result_image=r, method="replicate-idm-vton")
        except Exception as e:
            errors.append(f"Replicate: {e}"); print(f"❌ {errors[-1]}")
    if LOCAL_IDM_OK:
        try:
            print("→ Local IDM-VTON...")
            r = tryon_local_idm(req.person_image, req.cloth_image)
            print("✅ Local IDM-VTON success")
            return TryOnResponse(result_image=r, method="local-idm-vton")
        except Exception as e:
            errors.append(f"Local: {e}"); print(f"❌ {errors[-1]}")
    try:
        print("→ OpenCV fallback...")
        r = tryon_opencv(req.person_image, req.cloth_image)
        print("✅ OpenCV success")
        return TryOnResponse(result_image=r, method="opencv-fallback")
    except Exception as e:
        raise HTTPException(500, "All backends failed: " + " | ".join(errors))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, reload=False)
