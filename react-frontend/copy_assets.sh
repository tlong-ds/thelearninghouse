#!/bin/zsh

# Create necessary directories if they don't exist
mkdir -p public/assets
mkdir -p public/fonts
mkdir -p build/assets
mkdir -p build/fonts

# Copy logos and images to public folder
cp -R "../logo/"* public/assets/

# Copy logos and images to build folder
cp -R "../logo/"* build/assets/

# Copy fonts to public folder
cp -R "../style/fonts/"* public/fonts/ 2>/dev/null || true

# Copy fonts to build folder
if [ -d "../style/fonts" ]; then
  cp -R "../style/fonts/"* build/fonts/
fi

echo "Assets copied successfully!"
