# Trendly AR Try-On — Setup Guide

## Your Actual Project Structure

```
trend/
├── src/
│   └── pages/
│       └── ARMirror.tsx        ← React frontend (already updated)
│
└── ar-tryon-server/
    ├── server.py               ← Python backend (v4, updated)
    ├── requirements.txt
    ├── start.sh                ← Mac/Linux launcher
    ├── start.bat               ← Windows launcher
    └── IDM-VTON/               ← (optional) local model folder
```

---

## Quality Tiers

| Mode | Quality | Speed | Cost | Setup |
|------|---------|-------|------|-------|
| **Replicate IDM-VTON** | ⭐⭐⭐⭐⭐ Photorealistic | ~15–30s | ~$0.004/image | 5 min |
| **Local IDM-VTON** | ⭐⭐⭐⭐⭐ Photorealistic | ~30–60s | Free | GPU needed |
| **OpenCV fallback** | ⭐⭐ Overlay | < 1s | Free | Already works |

---

## Option A: Replicate API (Recommended — No GPU Needed)

### 1. Get a Free Token
1. Go to **https://replicate.com** → Sign up (free)
2. Go to **Account → API tokens**
3. Click **Create token** → Copy it

### 2. Set the Token & Start Server

**Windows:**
```bat
cd ar-tryon-server
set REPLICATE_API_TOKEN=r8_your_token_here
start.bat
```

**Mac / Linux:**
```bash
cd ar-tryon-server
export REPLICATE_API_TOKEN=r8_your_token_here
./start.sh
```

That's it. Server runs on `http://127.0.0.1:8001`. Your frontend already calls this.

### 3. Start Your Frontend (in a separate terminal)
```bash
cd ..          # back to trend/ root
npm run dev
```

### 4. Use the AR Mirror
1. Open your app → **AR Mirror** page
2. Click **AI Try-On** tab
3. Upload your photo
4. Select a garment from your closet
5. Hit **Generate Try-On**
6. Result badge will show: 🟢 **AI · IDM-VTON** = photorealistic quality

---

## Option B: Local IDM-VTON (GPU Required)

### Requirements
- NVIDIA GPU with **8GB+ VRAM** (RTX 3070 / 4060 or better)
- CUDA 11.8+ installed

### Setup
```bash
cd ar-tryon-server

# Clone the model
git clone https://github.com/yisol/IDM-VTON.git

# Install model dependencies
cd IDM-VTON
pip install -r requirements.txt

# Download weights (follow IDM-VTON README)
# Place in: ar-tryon-server/IDM-VTON/ckpt/
```

Then start the server normally — it will auto-detect the local model.

---

## How the Frontend Works

Your `ARMirror.tsx` already sends:
```json
POST http://127.0.0.1:8001/tryon
{
  "person_image": "data:image/jpeg;base64,...",
  "cloth_image":  "data:image/jpeg;base64,..."
}
```

The server responds:
```json
{
  "result_image": "data:image/jpeg;base64,...",
  "method": "replicate-idm-vton"   ← shown as badge in UI
}
```

The result pops up in your **"Your Look ✨"** modal with:
- **Save to Profile** → saves to Supabase
- **Download** → downloads PNG

---

## Checking Server Status

Open browser: `http://127.0.0.1:8001/health`

Response tells you which backends are active:
```json
{
  "status": "ok",
  "replicate_ready": true,
  "local_idm_ready": false,
  "opencv_ready": true
}
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Server offline` error in app | Start `server.py` first |
| Result is OpenCV quality | Set `REPLICATE_API_TOKEN` |
| `replicate` not found | `pip install replicate` |
| Replicate auth error | Check token is correct |
| Slow results | Normal — IDM-VTON takes 15–30s |
| Camera not working | Allow camera in browser permissions |
