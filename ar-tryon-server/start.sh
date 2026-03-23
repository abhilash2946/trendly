#!/bin/bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Trendly AR Try-On Server v4"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for Replicate token
if [ -z "$REPLICATE_API_TOKEN" ]; then
  echo ""
  echo "  ⚠️  No REPLICATE_API_TOKEN found."
  echo "  → Get a free token at https://replicate.com"
  echo "  → Then run:"
  echo "     export REPLICATE_API_TOKEN=r8_yourtoken"
  echo "     ./start.sh"
  echo ""
  echo "  Running in OpenCV fallback mode for now..."
else
  echo "  ✅ Replicate token found — IDM-VTON AI quality enabled!"
fi

echo ""
echo "  Installing / updating dependencies..."
pip install -r requirements.txt -q

echo ""
echo "  Starting server on http://127.0.0.1:8001 ..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
python server.py
