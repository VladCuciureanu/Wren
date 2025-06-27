#!/bin/bash
# Generate ambient sound assets using ffmpeg synthesis
# All tremolo freq must be >= 0.1
set -euo pipefail

OUT="assets/forest"
mkdir -p "$OUT"

echo "Generating birdsong (40s)..."
ffmpeg -y -f lavfi -i "
  sine=f=2800:d=40,
  tremolo=f=12:d=0.9,
  aformat=sample_fmts=fltp,
  volume=0.15
" -f lavfi -i "
  sine=f=4200:d=40,
  tremolo=f=8:d=0.95,
  aformat=sample_fmts=fltp,
  volume=0.12
" -f lavfi -i "
  sine=f=3500:d=40,
  tremolo=f=15:d=0.85,
  aformat=sample_fmts=fltp,
  volume=0.10
" -f lavfi -i "
  sine=f=5000:d=40,
  tremolo=f=6:d=0.9,
  aformat=sample_fmts=fltp,
  volume=0.08
" -f lavfi -i "
  anoisesrc=d=40:c=pink:a=0.03,
  highpass=f=200,
  lowpass=f=2000
" -filter_complex "
  [0:a][1:a][2:a][3:a][4:a]amix=inputs=5:duration=first:normalize=0,
  afade=t=in:d=2,afade=t=out:st=38:d=2
" -c:a libvorbis -q:a 5 "$OUT/birdsong.ogg" -loglevel warning

echo "Generating wind (20s)..."
ffmpeg -y -f lavfi -i "
  anoisesrc=d=20:c=brown:a=0.4,
  highpass=f=80,
  lowpass=f=800,
  tremolo=f=0.3:d=0.4,
  afade=t=in:d=1,afade=t=out:st=18.5:d=1.5
" -c:a libvorbis -q:a 5 "$OUT/wind.ogg" -loglevel warning

echo "Generating thunder (45s)..."
ffmpeg -y -f lavfi -i "
  anoisesrc=d=45:c=brown:a=0.6,
  lowpass=f=150,
  highpass=f=20,
  tremolo=f=0.15:d=0.7
" -f lavfi -i "
  anoisesrc=d=45:c=brown:a=0.3,
  lowpass=f=300,
  highpass=f=40,
  tremolo=f=0.1:d=0.9
" -filter_complex "
  [0:a][1:a]amix=inputs=2:duration=first:normalize=0,
  afade=t=in:d=2,afade=t=out:st=43:d=2
" -c:a libvorbis -q:a 5 "$OUT/thunder.ogg" -loglevel warning

echo "Generating rain (20s)..."
ffmpeg -y -f lavfi -i "
  anoisesrc=d=20:c=pink:a=0.25,
  highpass=f=400,
  lowpass=f=8000,
  tremolo=f=2:d=0.15
" -f lavfi -i "
  anoisesrc=d=20:c=white:a=0.08,
  highpass=f=2000,
  lowpass=f=10000,
  tremolo=f=4:d=0.2
" -filter_complex "
  [0:a][1:a]amix=inputs=2:duration=first:normalize=0,
  afade=t=in:d=1,afade=t=out:st=18.5:d=1.5
" -c:a libvorbis -q:a 5 "$OUT/rain.ogg" -loglevel warning

echo "Generating hum (15s)..."
ffmpeg -y -f lavfi -i "sine=f=60:d=15,volume=0.3" \
       -f lavfi -i "sine=f=120:d=15,volume=0.15" \
       -f lavfi -i "sine=f=180:d=15,volume=0.08" \
       -f lavfi -i "sine=f=240:d=15,volume=0.04" \
  -filter_complex "
  [0:a][1:a][2:a][3:a]amix=inputs=4:duration=first:normalize=0,
  tremolo=f=0.2:d=0.2,
  afade=t=in:d=1,afade=t=out:st=13.5:d=1.5
" -c:a libvorbis -q:a 5 "$OUT/hum.ogg" -loglevel warning

echo "Generating chime (8s)..."
ffmpeg -y \
  -f lavfi -i "sine=f=523.25:d=8,volume=0.3" \
  -f lavfi -i "sine=f=659.25:d=8,volume=0.25" \
  -f lavfi -i "sine=f=783.99:d=8,volume=0.2" \
  -f lavfi -i "sine=f=1046.5:d=8,volume=0.15" \
  -filter_complex "
  [0:a][1:a][2:a][3:a]amix=inputs=4:duration=first:normalize=0,
  afade=t=in:d=0.01,afade=t=out:st=1:d=7
" -c:a libvorbis -q:a 5 "$OUT/chime.ogg" -loglevel warning

echo "Generating static (12s)..."
ffmpeg -y -f lavfi -i "
  anoisesrc=d=12:c=white:a=0.08,
  highpass=f=100,
  lowpass=f=6000,
  tremolo=f=0.5:d=0.3,
  afade=t=in:d=1,afade=t=out:st=10.5:d=1.5
" -c:a libvorbis -q:a 5 "$OUT/static.ogg" -loglevel warning

echo ""
echo "Done. Assets in $OUT/:"
ls -lh "$OUT"/*.ogg
