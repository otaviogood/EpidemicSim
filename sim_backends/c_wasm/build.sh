#!/bin/bash
set -e
OUT_DIR=../../src/generated_wasm
FLAGS="--minify 0 --bind -s WASM=1 -s DISABLE_EXCEPTION_CATCHING=0 -s ASSERTIONS=1 -O3 -s EXPORT_ES6=1 -s MODULARIZE=1 -s USE_ES6_IMPORT_META=0 -s ALLOW_MEMORY_GROWTH=1"

emcc $FLAGS -o $OUT_DIR/resident_counter.js resident_counter.cc

