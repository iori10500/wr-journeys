#!/bin/bash
# Generate PDFs for all itinerary brochures using Chrome headless
# Usage: ./generate-pdfs.sh [itinerary-id]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/public"
PDF_DIR="$PUBLIC_DIR/pdfs"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Also try Linux Chrome location
if [ ! -f "$CHROME" ]; then
  CHROME=$(which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null || which chromium 2>/dev/null || echo "")
fi

if [ -z "$CHROME" ]; then
  echo "Error: Chrome/Chromium not found. Install it or set CHROME env var."
  exit 1
fi

mkdir -p "$PDF_DIR"

# Start local HTTP server for image resolution
echo "Starting local HTTP server on port 9999..."
python3 -m http.server 9999 --directory "$PUBLIC_DIR" &
SERVER_PID=$!
sleep 1

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

generate_pdf() {
  local html_file="$1"
  local pdf_name="$2"
  local url="http://localhost:9999/brochure/$html_file"
  local pdf_path="$PDF_DIR/$pdf_name"

  echo -n "Generating $pdf_name... "
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$pdf_path" "$url" 2>/dev/null

  if [ -f "$pdf_path" ]; then
    local size=$(du -sh "$pdf_path" | cut -f1)
    echo "✓ ($size)"
  else
    echo "✗ FAILED"
  fi
  sleep 1
}

if [ -n "$1" ]; then
  # Generate single itinerary by ID
  ID="$1"
  case "$ID" in
    milan-como)          generate_pdf "milan-como.html" "milan-como.pdf" ;;
    zurich-lucerne-4d3n) generate_pdf "swiss-4d3n.html" "zurich-lucerne-4d3n.pdf" ;;
    swiss-classic-7d6n)  generate_pdf "swiss-7d6n.html" "swiss-classic-7d6n.pdf" ;;
    tanzania-luxury-safari) generate_pdf "tanzania-luxury-safari.html" "tanzania-luxury-safari.pdf" ;;
    london-paris-9d)     generate_pdf "london-paris-9d.html" "london-paris-9d.pdf" ;;
    *) echo "Unknown itinerary: $ID" ;;
  esac
else
  # Generate all
  generate_pdf "milan-como.html" "milan-como.pdf"
  generate_pdf "swiss-4d3n.html" "zurich-lucerne-4d3n.pdf"
  generate_pdf "swiss-7d6n.html" "swiss-classic-7d6n.pdf"
  generate_pdf "tanzania-luxury-safari.html" "tanzania-luxury-safari.pdf"
  generate_pdf "london-paris-9d.html" "london-paris-9d.pdf"
fi

echo "Done!"