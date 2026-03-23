"""
Trendly YOLOv8 Fashion Detection Server
Port: 5001

Pipeline (the fix for background color contamination):
  1. YOLOv8 detects bounding boxes for each clothing item
  2. Each bbox crop → rembg (U-2-Net) removes background → RGBA with alpha=0 for bg
  3. Color is extracted ONLY from pixels where alpha > 128 (foreground only)
  4. Result: navy shoe on a brown table → correctly identified as "navy", not "brown"

Install:
  pip install ultralytics flask flask-cors pillow rembg numpy

Run:
  python yolo_server.py
"""

import base64
import io
import sys
import numpy as np
from collections import deque
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)

# ── Body region definitions (normalized 0-1, top-to-bottom) ──────────────────
BODY_REGIONS = {
    'head':       (0.00, 0.15),
    'neck':       (0.12, 0.28),
    'upper_body': (0.15, 0.55),
    'lower_body': (0.45, 0.90),
    'feet':       (0.80, 1.00),
    'full_body':  (0.00, 1.00),
    'object':     (0.00, 1.00),
}

# ── Fashion class mappings ────────────────────────────────────────────────────
FASHION_CLASSES = {
    'short sleeve top':   ('Tops', 'T-Shirt'),
    'long sleeve top':    ('Tops', 'Shirt'),
    'short sleeve shirt': ('Tops', 'Shirt'),
    'long sleeve shirt':  ('Tops', 'Shirt'),
    'vest':               ('Tops', 'Tank Top'),
    'sling':              ('Tops', 'Tank Top'),
    'tshirt':             ('Tops', 'T-Shirt'),
    'blouse':             ('Tops', 'Blouse'),
    'polo':               ('Tops', 'Polo Shirt'),
    'hoodie':             ('Tops', 'Hoodie'),
    'sweatshirt':         ('Tops', 'Sweatshirt'),
    'crop top':           ('Tops', 'Crop Top'),
    'trousers':           ('Bottoms', 'Pants'),
    'shorts':             ('Bottoms', 'Shorts'),
    'skirt':              ('Bottoms', 'Skirt'),
    'jeans':              ('Bottoms', 'Jeans'),
    'leggings':           ('Bottoms', 'Leggings'),
    'joggers':            ('Bottoms', 'Joggers'),
    'short sleeve dress': ('Dresses', 'Mini Dress'),
    'long sleeve dress':  ('Dresses', 'Casual Dress'),
    'vest dress':         ('Dresses', 'Casual Dress'),
    'sling dress':        ('Dresses', 'Casual Dress'),
    'jacket':             ('Outerwear', 'Jacket'),
    'coat':               ('Outerwear', 'Coat'),
    'blazer':             ('Outerwear', 'Blazer'),
    'cardigan':           ('Outerwear', 'Cardigan'),
    'windbreaker':        ('Outerwear', 'Windbreaker'),
    'sneakers':           ('Shoes', 'Sneakers'),
    'boots':              ('Shoes', 'Boots'),
    'sandals':            ('Shoes', 'Sandals'),
    'heels':              ('Shoes', 'Heels'),
    'loafers':            ('Shoes', 'Loafers'),
    'flats':              ('Shoes', 'Flats'),
    'necklace':           ('Accessories', 'Necklace'),
    'ring':               ('Accessories', 'Ring'),
    'bracelet':           ('Accessories', 'Bracelet'),
    'earrings':           ('Accessories', 'Earrings'),
    'watch':              ('Accessories', 'Watch'),
    'bag':                ('Accessories', 'Bag'),
    'belt':               ('Accessories', 'Belt'),
    'hat':                ('Accessories', 'Hat'),
    'cap':                ('Accessories', 'Hat'),
    'sunglasses':         ('Accessories', 'Sunglasses'),
    'scarf':              ('Accessories', 'Scarf'),
}

# ── CLIP prompts ──────────────────────────────────────────────────────────────
CATEGORY_PROMPTS = [
    ("Tops",        "T-Shirt",      "a photo of a t-shirt or shirt worn on the upper body"),
    ("Tops",        "Blouse",       "a photo of a blouse or women's top"),
    ("Tops",        "Hoodie",       "a photo of a hoodie or sweatshirt"),
    ("Bottoms",     "Jeans",        "a photo of jeans or denim pants"),
    ("Bottoms",     "Pants",        "a photo of trousers, chinos or dress pants"),
    ("Bottoms",     "Shorts",       "a photo of shorts"),
    ("Bottoms",     "Skirt",        "a photo of a skirt"),
    ("Dresses",     "Casual Dress", "a photo of a dress covering top and bottom"),
    ("Outerwear",   "Jacket",       "a photo of a jacket or coat worn over clothes"),
    ("Outerwear",   "Blazer",       "a photo of a blazer or suit jacket"),
    ("Shoes",       "Sneakers",     "a photo of sneakers or athletic shoes"),
    ("Shoes",       "Boots",        "a photo of boots or ankle boots"),
    ("Shoes",       "Sandals",      "a photo of sandals or open-toe shoes"),
    ("Shoes",       "Heels",        "a photo of high heels or pumps"),
    ("Shoes",       "Loafers",      "a photo of loafers or dress shoes"),
    ("Accessories", "Necklace",     "a photo of a necklace or chain jewelry"),
    ("Accessories", "Ring",         "a photo of a ring or finger jewelry"),
    ("Accessories", "Bag",          "a photo of a handbag, tote or backpack"),
    ("Accessories", "Watch",        "a photo of a wristwatch"),
    ("Accessories", "Sunglasses",   "a photo of sunglasses or eyewear"),
    ("Accessories", "Belt",         "a photo of a belt"),
    ("Accessories", "Hat",          "a photo of a hat or cap"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Model loading
# ─────────────────────────────────────────────────────────────────────────────

print("Loading models...")
YOLO_AVAILABLE = False
MODEL = None

try:
    from ultralytics import YOLO
    try:
        MODEL = YOLO("yolov8n.pt")
        print("✅ YOLOv8n loaded")
        YOLO_AVAILABLE = True
    except Exception as e:
        print(f"⚠️  YOLOv8 load failed: {e}")
except ImportError:
    print("⚠️  ultralytics not installed — pip install ultralytics")

# rembg — U-2-Net: the key fix for background-contaminated color detection
REMBG_AVAILABLE = False
rembg_fn = None
REMBG_SESSION = None

try:
    from rembg import new_session, remove as _rembg_remove
    rembg_fn = _rembg_remove
    try:
        # Force CPU provider so onnxruntime doesn't try CUDA DLLs on systems without CUDA.
        REMBG_SESSION = new_session(providers=["CPUExecutionProvider"])
    except Exception as e:
        print(f"[rembg] CPU provider session init failed, using default session: {e}")
        REMBG_SESSION = None
    REMBG_AVAILABLE = True
    print("✅ rembg (U-2-Net) loaded — proper background removal active")
except ImportError:
    print("⚠️  rembg not installed — pip install rembg")
    print("   Without rembg, color accuracy will be reduced (BFS fallback used).")

# CLIP
CLIP_AVAILABLE = False
CLIP_MODEL = None
CLIP_PREPROCESS = None
DEVICE = "cpu"

try:
    import clip, torch
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    CLIP_MODEL, CLIP_PREPROCESS = clip.load("ViT-B/32", device=DEVICE)
    CLIP_AVAILABLE = True
    print(f"✅ CLIP ViT-B/32 loaded on {DEVICE}")
except Exception as e:
    print(f"ℹ️  CLIP not available: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Background Removal
# ─────────────────────────────────────────────────────────────────────────────

def remove_background_rembg(image: Image.Image) -> Image.Image:
    """Remove background using U-2-Net via rembg. Returns RGBA."""
    if REMBG_SESSION is not None:
        result = rembg_fn(image, session=REMBG_SESSION)
    else:
        result = rembg_fn(image)
    return result.convert("RGBA")


def remove_background_bfs(image: Image.Image) -> Image.Image:
    """
    Fallback: edge flood-fill background removal (pure Python/numpy).
    Returns RGBA where background pixels have alpha=0.
    """
    img = image.convert("RGB")
    W, H = img.size
    px = np.array(img, dtype=np.float32)

    # Sample background color from full edge ring
    edge_mask = np.zeros((H, W), dtype=bool)
    edge_mask[0, :] = True
    edge_mask[-1, :] = True
    edge_mask[:, 0] = True
    edge_mask[:, -1] = True
    edge_pixels = px[edge_mask]
    bg_color = edge_pixels.mean(axis=0)
    bg_bright = float(bg_color.mean())

    # Adaptive tolerance based on background brightness
    if bg_bright > 210:   tol = 65
    elif bg_bright > 170: tol = 55
    elif bg_bright > 120: tol = 45
    elif bg_bright < 60:  tol = 22
    else:                 tol = 42

    dist = np.sqrt(((px - bg_color) ** 2).sum(axis=2))
    is_bg_pixel = dist < tol

    # BFS flood fill from all edge pixels
    visited = np.zeros((H, W), dtype=bool)
    queue = deque()

    for x in range(W):
        for y in [0, H-1]:
            if is_bg_pixel[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
    for y in range(H):
        for x in [0, W-1]:
            if is_bg_pixel[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not visited[ny, nx] and is_bg_pixel[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.array(img)
    rgba[:, :, 3] = np.where(visited, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def remove_background(image: Image.Image) -> Image.Image:
    """Try rembg first, fall back to BFS."""
    if REMBG_AVAILABLE:
        try:
            return remove_background_rembg(image)
        except Exception as e:
            print(f"[rembg error] {e} — using BFS fallback")
    return remove_background_bfs(image)


# ─────────────────────────────────────────────────────────────────────────────
# Color Extraction (foreground-only)
# ─────────────────────────────────────────────────────────────────────────────

def rgb_to_color_name(r: float, g: float, b: float) -> str:
    brightness = (r + g + b) / 3
    mx = max(r, g, b)
    delta = mx - min(r, g, b)
    sat = delta / mx if mx > 0 else 0

    if sat < 0.13:
        if brightness < 40:  return "black"
        if brightness < 85:  return "charcoal"
        if brightness < 145: return "gray"
        if brightness < 205: return "silver"
        return "white"

    hue = 0.0
    if mx == r:   hue = ((g - b) / delta) % 6
    elif mx == g: hue = (b - r) / delta + 2
    else:         hue = (r - g) / delta + 4
    hue *= 60
    if hue < 0: hue += 360

    if sat < 0.30 and brightness > 140 and 20 < hue < 60: return "beige"
    if sat < 0.35 and 100 < brightness < 160 and 20 < hue < 55: return "khaki"
    if hue < 18 or hue >= 342: return "maroon" if brightness < 85 else "red"
    if hue < 38:  return "brown" if brightness < 110 else "orange"
    if hue < 68:  return "olive" if brightness < 130 else "yellow"
    if hue < 82:  return "lime"
    if hue < 163: return "green" if sat > 0.4 else "sage"
    if hue < 193: return "teal"
    if hue < 262: return "navy" if brightness < 78 else "blue"
    if hue < 292: return "indigo" if brightness < 90 else "purple"
    if hue < 320: return "plum" if brightness < 100 else "violet"
    if hue < 342: return "wine" if brightness < 110 else "pink"
    return "red"


def get_color_from_rgba(rgba_image: Image.Image) -> str:
    """
    Extract dominant color using ONLY foreground pixels (alpha > 128).

    Pipeline:
      1. Filter out bg pixels (alpha=0 from rembg/BFS)
      2. Filter out known background colours (white studio, brown wood table)
      3. KMeans(n=3) on remaining pixels — picks the largest cluster
      4. Map dominant cluster centre → colour name

    Example: navy shoe on brown table
      - After bg removal, some brown edge pixels may remain
      - Brown filter step removes them explicitly
      - KMeans on the rest → navy cluster wins
    """
    # Downsample for speed
    W, H = rgba_image.size
    if max(W, H) > 96:
        scale = 96 / max(W, H)
        rgba_image = rgba_image.resize(
            (max(1, int(W * scale)), max(1, int(H * scale))), Image.LANCZOS
        )

    rgba_arr = np.array(rgba_image.convert("RGBA"), dtype=np.float32)
    alpha = rgba_arr[:, :, 3]
    fg_mask = alpha > 128
    fg_pixels = rgba_arr[fg_mask, :3]

    if len(fg_pixels) < 5:
        fg_pixels = rgba_arr[:, :, :3].reshape(-1, 3)

    # Fix 2: explicit filter for common studio and background colours
    # White / near-white studio background
    not_white = ~((fg_pixels[:, 0] > 200) & (fg_pixels[:, 1] > 200) & (fg_pixels[:, 2] > 200))
    # Brown wooden table / surface (warm, mid-dark, low saturation)
    r, g, b = fg_pixels[:, 0], fg_pixels[:, 1], fg_pixels[:, 2]
    not_brown_wood = ~((r > 100) & (r < 200) & (g > 60) & (g < 140) & (b < 90) & (r > g) & (g > b))
    clean = fg_pixels[not_white & not_brown_wood]
    if len(clean) >= 5:
        fg_pixels = clean

    # Remove extreme brightness outliers (specular highlights and deep shadows)
    brightness = fg_pixels.mean(axis=1)
    p10, p90 = np.percentile(brightness, 10), np.percentile(brightness, 90)
    core = fg_pixels[(brightness >= p10) & (brightness <= p90)]
    if len(core) < 5:
        core = fg_pixels

    # Fix 4: KMeans clustering — finds the TRUE dominant colour cluster
    # instead of a contaminated average.
    # Use 3 clusters; pick the largest one (most pixels = the garment fabric).
    try:
        from sklearn.cluster import KMeans
        n = min(3, len(core))
        km = KMeans(n_clusters=n, n_init=10, random_state=0)
        km.fit(core)
        # Count pixels in each cluster
        labels = km.labels_
        counts = np.bincount(labels)
        dominant_idx = int(counts.argmax())
        centre = km.cluster_centers_[dominant_idx]
        mean_r, mean_g, mean_b = float(centre[0]), float(centre[1]), float(centre[2])
        method = "kmeans"
    except Exception:
        # sklearn not available — fall back to saturation-weighted mean
        rc, gc, bc = core[:, 0], core[:, 1], core[:, 2]
        mxc = np.maximum(np.maximum(rc, gc), bc)
        mnc = np.minimum(np.minimum(rc, gc), bc)
        sat = np.where(mxc > 0, (mxc - mnc) / mxc, 0.0)
        median_sat = float(np.median(sat))
        if median_sat > 0.15:
            sat_thresh = np.percentile(sat, 35)
            sat_core = core[sat >= sat_thresh]
            if len(sat_core) >= 5:
                core = sat_core
        mean_r = float(core[:, 0].mean())
        mean_g = float(core[:, 1].mean())
        mean_b = float(core[:, 2].mean())
        method = "mean"

    color = rgb_to_color_name(mean_r, mean_g, mean_b)
    print(f"[color/{method}] fg={len(fg_pixels)}px, core={len(core)}px, "
          f"RGB=({mean_r:.0f},{mean_g:.0f},{mean_b:.0f}) → {color}")
    return color


def get_color_from_crop(image: Image.Image, bbox=None) -> str:
    """
    Full color pipeline (3-layer background defence):
      1. Shrink bbox 15% each side  — strips most edge background
      2. Crop center 50%            — keeps object core only
      3. rembg / BFS bg removal    — removes remaining bg pixels
      4. KMeans on foreground only  — dominant garment color
    """
    if bbox:
        x1, y1, x2, y2 = [float(v) for v in bbox]
        # Layer 1: shrink bbox margins to cut background at edges
        mx = (x2 - x1) * 0.15
        my = (y2 - y1) * 0.15
        x1 += mx; y1 += my; x2 -= mx; y2 -= my
        crop = image.crop((int(x1), int(y1), int(x2), int(y2)))
    else:
        crop = image.copy()

    # Layer 2: focus on center 50% of the crop (the object heart, not its edges)
    w, h = crop.size
    if w >= 16 and h >= 16:
        crop = crop.crop((int(w * 0.25), int(h * 0.25),
                          int(w * 0.75), int(h * 0.75)))

    rgba = remove_background(crop)
    return get_color_from_rgba(rgba)


# ─────────────────────────────────────────────────────────────────────────────
# CLIP Classification
# ─────────────────────────────────────────────────────────────────────────────

def classify_with_clip(image: Image.Image) -> list:
    import torch
    prompts = [p for _, _, p in CATEGORY_PROMPTS]
    img_tensor = CLIP_PREPROCESS(image).unsqueeze(0).to(DEVICE)
    tokens = clip.tokenize(prompts).to(DEVICE)

    with torch.no_grad():
        img_feat = CLIP_MODEL.encode_image(img_tensor)
        txt_feat = CLIP_MODEL.encode_text(tokens)
        img_feat /= img_feat.norm(dim=-1, keepdim=True)
        txt_feat /= txt_feat.norm(dim=-1, keepdim=True)
        sim = (100.0 * img_feat @ txt_feat.T).softmax(dim=-1)

    probs = sim[0].cpu().numpy()
    best_idx = int(probs.argmax())
    category, sub_category, _ = CATEGORY_PROMPTS[best_idx]
    confidence = float(probs[best_idx])

    # Use background-removed color extraction
    color = get_color_from_crop(image)
    tags = [category.upper(), color.upper(), sub_category.upper().replace(" ", "_")]

    return [{
        "category": category,
        "sub_category": sub_category,
        "color": color,
        "tags": tags,
        "confidence": round(confidence, 3),
        "bbox": None,
    }]


# ─────────────────────────────────────────────────────────────────────────────
# YOLO Detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_with_yolo(image: Image.Image) -> list:
    """
    Detect all clothing items with YOLOv8.
    Each detected bbox is individually background-removed before color extraction.
    """
    results = MODEL(image, verbose=False)[0]
    detections = []
    img_w, img_h = image.size

    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        cls_name = results.names[int(box.cls[0])].lower()

        if conf < 0.35:
            continue

        mapped = FASHION_CLASSES.get(cls_name)

        center_y_norm = ((y1 + y2) / 2) / img_h
        region = 'object'
        for reg_name, (reg_top, reg_bot) in BODY_REGIONS.items():
            if reg_top <= center_y_norm <= reg_bot:
                region = reg_name
                break

        if not mapped and CLIP_AVAILABLE:
            crop = image.crop((int(x1), int(y1), int(x2), int(y2)))
            clip_results = classify_with_clip(crop)
            if clip_results:
                r = clip_results[0]
                r['bbox'] = [round(x1), round(y1), round(x2), round(y2)]
                r['confidence'] = round(conf * r.get('confidence', 0.5), 3)
                r['region'] = region
                detections.append(r)
            continue

        if not mapped:
            continue

        category, sub_category = mapped

        # ── THE FIX: crop bbox → remove background → foreground-only color ───
        color = get_color_from_crop(image, (x1, y1, x2, y2))
        print(f"[YOLO] {cls_name} conf={conf:.2f} → {category}/{sub_category} | {color}")

        tags = [category.upper(), color.upper(), sub_category.upper().replace(" ", "_")]
        detections.append({
            "category": category,
            "sub_category": sub_category,
            "color": color,
            "tags": tags,
            "confidence": round(conf, 3),
            "bbox": [round(x1), round(y1), round(x2), round(y2)],
            "region": region,
        })

    # Deduplicate overlapping detections of same category
    deduped = []
    for det in sorted(detections, key=lambda x: -x['confidence']):
        overlap = False
        for kept in deduped:
            if kept['category'] == det['category'] and det.get('bbox') and kept.get('bbox'):
                b1, b2 = det['bbox'], kept['bbox']
                ix = max(0, min(b1[2], b2[2]) - max(b1[0], b2[0]))
                iy = max(0, min(b1[3], b2[3]) - max(b1[1], b2[1]))
                intersection = ix * iy
                area1 = (b1[2]-b1[0]) * (b1[3]-b1[1])
                if area1 > 0 and intersection / area1 > 0.5:
                    overlap = True
                    break
        if not overlap:
            deduped.append(det)

    return deduped


def detect_all(image: Image.Image) -> list:
    """Main pipeline: YOLO → CLIP → minimal fallback."""
    if YOLO_AVAILABLE:
        results = detect_with_yolo(image)
        if results:
            return results
    if CLIP_AVAILABLE:
        return classify_with_clip(image)
    color = get_color_from_crop(image)
    return [{"category": "Tops", "sub_category": None, "color": color,
             "tags": ["TOPS", color.upper()], "confidence": 0.1, "bbox": None}]


def decode_image(data: str) -> Image.Image:
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


# ─────────────────────────────────────────────────────────────────────────────
# Flask Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "yolo": YOLO_AVAILABLE,
                    "clip": CLIP_AVAILABLE, "rembg": REMBG_AVAILABLE})


@app.route("/classify", methods=["POST"])
def classify():
    data = request.get_json(force=True)
    image_data = data.get("image", "")
    if not image_data:
        return jsonify({"error": "No image provided"}), 400
    try:
        image = decode_image(image_data)
        results = detect_all(image)
        return jsonify(results[0]) if results else (jsonify({"error": "Nothing detected"}), 422)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/detect", methods=["POST"])
def detect_endpoint():
    data = request.get_json(force=True)
    image_data = data.get("image", "")
    if not image_data:
        return jsonify({"error": "No image provided"}), 400
    try:
        image = decode_image(image_data)
        results = detect_all(image)
        return jsonify({"items": results, "count": len(results)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    print(f"\n🚀 Trendly Detection Server on port {port}")
    print(f"   YOLO:  {'✅' if YOLO_AVAILABLE else '❌  pip install ultralytics'}")
    print(f"   CLIP:  {'✅' if CLIP_AVAILABLE else '❌  (optional) pip install git+https://github.com/openai/CLIP.git'}")
    print(f"   rembg: {'✅ BACKGROUND REMOVAL ACTIVE' if REMBG_AVAILABLE else '❌  pip install rembg  ← needed for correct colors!'}")
    print(f"\nEndpoints:")
    print(f"   GET  /health   — status + which models are loaded")
    print(f"   POST /classify — single item (backwards compatible)")
    print(f"   POST /detect   — multi-item detection\n")
    app.run(host="0.0.0.0", port=port, debug=False)
