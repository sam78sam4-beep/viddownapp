#!/bin/bash
echo "🔧 Installing yt-dlp using pip..."
pip install yt-dlp

# Verify installation
if command -v yt-dlp &> /dev/null; then
    echo "✅ yt-dlp installed successfully"
    yt-dlp --version
else
    echo "❌ Failed to install yt-dlp"
    exit 1
fi