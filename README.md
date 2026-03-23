
<div align="center">
  <img src="https://img.icons8.com/color/96/000000/fashion.png" width="80" alt="Trendly Logo"/>
  
  <h1>✨ Trendly ✨</h1>
  <p><b>AI-Powered Fashion & Style Platform</b></p>
  <p align="center">
    <img src="https://img.shields.io/badge/Frontend-React-blue?logo=react"/>
    <img src="https://img.shields.io/badge/Backend-Python%20%7C%20Node.js-green?logo=python&logoColor=white"/>
    <img src="https://img.shields.io/badge/AI-ML%20%7C%20CV-purple?logo=ai"/>
    <img src="https://img.shields.io/badge/License-MIT-yellow"/>
  </p>
  <p>Personalized outfits, AR try-on, smart wardrobe, and more — all powered by cutting-edge AI.</p>
</div>

---

## 🚀 Features

| 💡 | Feature                        | Description |
|-----|--------------------------------|-------------|
| 👗 | <b>AI Stylist</b>              | Personalized outfit suggestions based on your style & wardrobe |
| 🪞 | <b>AR Mirror</b>                | Virtual try-on with augmented reality |
| 🧳 | <b>Smart Wardrobe</b>           | Organize, analyze, and optimize your wardrobe |
| 🧑‍🎤 | <b>Hairstyle Studio</b>        | Experiment with hairstyles virtually |
| 🛍️ | <b>Shopping Search</b>         | Discover trending fashion and shop seamlessly |
| 🗓️ | <b>Event Scanner</b>           | Get outfit ideas for upcoming events |
| 📅 | <b>Outfit Planner</b>           | Plan outfits for any occasion |
| 📊 | <b>Dashboard & Profile</b>      | Track your style evolution |

---

## 🛠️ Tech Stack

<details>
  <summary><b>Click to expand</b></summary>

| Layer      | Technologies |
|------------|--------------|
| Frontend   | React, TypeScript, Vite |
| Backend    | Python (FastAPI/Flask), Node.js |
| AI/ML      | YOLO, CLIP, IDM-VTON, custom models |
| CV/AR      | OpenCV, Haarcascades, DensePose |
| Database   | Supabase (PostgreSQL) |
| Other      | Gradio, REST APIs, local AI servers |

</details>

---

## 📁 Project Structure

```text
trendly/
├── src/                 # Frontend React app
├── ar-tryon-server/     # AR try-on backend (Python)
├── clip-service/        # CLIP-based image analysis service
├── local-ai-server/     # Local AI/ML server (Node.js)
├── supabase/            # Database schema and SQL
```

---

## 🏁 Getting Started

<details>
  <summary><b>Quickstart Guide</b></summary>

1. <b>Clone the repository</b>
   ```bash
   git clone https://github.com/your-username/trendly.git
   cd trendly
   ```
2. <b>Install dependencies</b>
   - Frontend: `npm install`
   - Backend: Set up Python virtual environments and install requirements in `ar-tryon-server/` and `clip-service/`
3. <b>Configure environment variables</b> as needed
4. <b>Start services</b>
   - Frontend: `npm run dev`
   - Backend: Run `start.bat` or `start.sh` in backend folders
5. <b>Access the app</b> at [http://localhost:5173](http://localhost:5173)

</details>

---

## 📦 Requirements

- Node.js 18+
- Python 3.8+
- (Optional) CUDA for GPU acceleration
- Supabase account

---

## 🙏 Acknowledgements

- [VITON-HD](https://github.com/viton-research/VITON-HD)
- [YOLOv8](https://github.com/ultralytics/ultralytics)
- [CLIP](https://github.com/openai/CLIP)
- [Gradio](https://gradio.app/)

---

## 📄 License

This project is for research and educational purposes. See individual component folders for specific licenses.
