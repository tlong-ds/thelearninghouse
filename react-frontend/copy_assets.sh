#!/bin/bash

# Create necessary directories if they don't exist
mkdir -p public/assets
mkdir -p public/fonts

# Copy logos and images
cp -R "../style/light_logo.webp" "../style/dark_logo.webp" public/assets/
cp -R "../logo/"* public/assets/

# Copy fonts
cp -R "../style/fonts/"* public/fonts/

echo "Assets copied successfully!"
