#!/bin/bash
echo "Installing dependencies..."
pip install ultralytics torch torchvision flask flask-cors pillow
echo ""
echo "Starting Trendly YOLO Detection Server on port 5001..."
python3 yolo_server.py
