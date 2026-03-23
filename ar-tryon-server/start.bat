@echo off
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   Trendly AR Try-On Server v4
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IF "%REPLICATE_API_TOKEN%"=="" (
  echo.
  echo   WARNING: No REPLICATE_API_TOKEN set.
  echo   Get a free token at https://replicate.com
  echo   Then set it with:
  echo     set REPLICATE_API_TOKEN=r8_yourtoken
  echo     start.bat
  echo.
  echo   Running in OpenCV fallback mode for now...
) ELSE (
  echo   Replicate token found — IDM-VTON AI quality enabled!
)

echo.
echo   Installing / updating dependencies...
pip install -r requirements.txt -q

echo.
echo   Starting server on http://127.0.0.1:8001 ...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
python server.py
