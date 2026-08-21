#!/bin/sh
# Builds both distributions and packs everything the player needs into one zip:
# the single self-contained file, the unpacked source, and a short readme.
set -e
cd "$(dirname "$0")/.."
node tools/build-single.js
rm -rf dist/pack dist/void-fishing.zip
mkdir -p dist/pack
cp dist/void-fishing.html dist/pack/
cp index.html dist/pack/
cp -r css js dist/pack/
cp docs/README-play.md dist/pack/README.txt 2>/dev/null || true
cd dist/pack && zip -q -r ../void-fishing.zip . && cd ../..
rm -rf dist/pack
ls -la dist/
