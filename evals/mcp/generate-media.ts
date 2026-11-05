/**
 * The eval media generator (spec 058 phase 3, FR-026): writes, deterministically and without any
 * media tool or package, the two silent fixtures the media cases materialise.
 *
 *   tsx evals/mcp/generate-media.ts [--out <dir>]     (default: evals/mcp/fixtures/media)
 *
 * - `song.mp3`: 20 s of silence, MPEG-1 Layer III, 44,100 Hz, 32 kbps, mono, no CRC; 766 frames
 *   of 104 bytes (a 4-byte header, then zeros: side info with `main_data_begin` 0 and
 *   `part2_3_length` 0, so every granule is silent); no ID3 tag.
 * - `intro.mp4`: 30 s, ISO-BMFF holding one H.264 Constrained Baseline IDR frame, 16×16 black
 *   (a single I_PCM macroblock, Y 16, Cb / Cr 128), stored once and referenced by 30 samples of
 *   1 s each (30 chunks of one sample, every chunk offset pointing at the same frame; timescale
 *   1000). A single 30 s sample does not play in Chrome: it ends at once ("play() request was
 *   interrupted by end of playback", phase 3 baseline/media-browser-check.txt). Every creation /
 *   modification time is 0.
 *
 * The bytes depend only on the constants below, so a run on any OS reproduces the committed
 * files (checked by `packages/cli/src/__tests__/eval-cases.spec.ts`).
 *
 * Runs under tsx, outside Biome and every tsconfig, and imports only `node:` modules.
 */

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(HERE, 'fixtures', 'media');

// ---------------------------------------------------------------------------------------------
// mp3

/**
 * FF FB: sync, MPEG-1, Layer III, no CRC. 10: bitrate index 1 (32 kbps), 44,100 Hz, no padding.
 * C4: mono, no mode extension, not copyrighted, original, no emphasis.
 */
const MP3_HEADER = [0xff, 0xfb, 0x10, 0xc4] as const;
/** ⌊144 × 32000 / 44100⌋ */
const MP3_FRAME_BYTES = 104;
/** ⌈20 × 44100 / 1152⌉ */
const MP3_FRAMES = 766;

export function mp3(): Buffer {
  const out = Buffer.alloc(MP3_FRAME_BYTES * MP3_FRAMES);
  for (let i = 0; i < MP3_FRAMES; i++) out.set(MP3_HEADER, i * MP3_FRAME_BYTES);
  return out;
}

// ---------------------------------------------------------------------------------------------
// H.264 (Constrained Baseline, level 1.0, 16×16, 4:2:0)

/**
 * SPS: 67 (nal_ref_idc 3, type 7), profile_idc 66, constraint_set0/1 flags (C0), level_idc 10;
 * then ue/u bits 1 1 011 010 0 1 1 1 1 0 0 + stop bit: sps id 0, log2_max_frame_num_minus4 0,
 * pic_order_cnt_type 2, max_num_ref_frames 1, no gaps, width 1 MB, height 1 MB,
 * frame_mbs_only, direct_8x8_inference, no cropping, no VUI.
 */
const SPS = [0x67, 0x42, 0xc0, 0x0a, 0xda, 0x79] as const;

/**
 * PPS: 68 (nal_ref_idc 3, type 8); bits 1 1 0 0 1 1 1 0 00 1 1 1 0 0 0 + stop bit: pps id 0,
 * sps id 0, CAVLC, no field POC, one slice group, one ref idx per list, no weighted prediction,
 * QP / QS / chroma QP offsets 0, no deblocking control, no constrained intra, no redundant pics.
 */
const PPS = [0x68, 0xce, 0x38, 0x80] as const;

/**
 * IDR slice NAL: 65 (nal_ref_idc 3, type 5); header bits 1 0001000 1 0000 1 0 0 1: first_mb 0,
 * slice_type 7 (I, all slices), pps id 0, frame_num 0, idr_pic_id 0, no_output_of_prior_pics 0,
 * long_term_reference 0, slice_qp_delta 0; then mb_type 25 (I_PCM, `000011010`) and the
 * pcm_alignment_zero_bits up to the byte boundary.
 */
const IDR_HEADER = [0x65, 0x88, 0x84, 0x86, 0x80] as const;
/** Black in limited range. */
const PCM_Y = 16;
const PCM_C = 128;
/** rbsp_slice_trailing_bits: the stop bit and the alignment zeros. */
const RBSP_TRAILING = 0x80;

/** The IDR NAL unit: header, 256 luma + 64 Cb + 64 Cr PCM samples, trailing bits. */
function idrSlice(): Buffer {
  return Buffer.from([
    ...IDR_HEADER,
    ...new Array<number>(256).fill(PCM_Y),
    ...new Array<number>(128).fill(PCM_C),
    RBSP_TRAILING,
  ]);
}

// ---------------------------------------------------------------------------------------------
// ISO-BMFF

const TIMESCALE = 1000;
const DURATION = 30_000;
/** Samples (1 s each) referencing the one embedded frame; one sample does not play (see above) */
const SAMPLES = 30;
const SIZE = 16;
/** The identity matrix of mvhd / tkhd. */
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000] as const;

function u8(n: number): Buffer {
  return Buffer.from([n & 0xff]);
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function zeros(n: number): Buffer {
  return Buffer.alloc(n);
}

function ascii(s: string): Buffer {
  return Buffer.from(s, 'latin1');
}

function box(type: string, ...parts: readonly Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), ascii(type), body]);
}

function fullBox(type: string, version: number, flags: number, ...parts: readonly Buffer[]): Buffer {
  return box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...parts);
}

function matrix(): Buffer {
  return Buffer.concat(MATRIX.map(u32));
}

function moov(sampleSize: number, chunkOffset: number): Buffer {
  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    u32(0), // creation_time
    u32(0), // modification_time
    u32(TIMESCALE),
    u32(DURATION),
    u32(0x00010000), // rate 1.0
    u16(0x0100), // volume 1.0
    zeros(10), // reserved
    matrix(),
    zeros(24), // pre_defined
    u32(2) // next_track_ID
  );
  const tkhd = fullBox(
    'tkhd',
    0,
    0x000003, // track_enabled | track_in_movie
    u32(0), // creation_time
    u32(0), // modification_time
    u32(1), // track_ID
    u32(0), // reserved
    u32(DURATION),
    zeros(8), // reserved
    u16(0), // layer
    u16(0), // alternate_group
    u16(0), // volume (video)
    u16(0), // reserved
    matrix(),
    u32(SIZE << 16),
    u32(SIZE << 16)
  );
  const mdhd = fullBox(
    'mdhd',
    0,
    0,
    u32(0), // creation_time
    u32(0), // modification_time
    u32(TIMESCALE),
    u32(DURATION),
    u16(0x55c4), // language 'und'
    u16(0) // pre_defined
  );
  const hdlr = fullBox(
    'hdlr',
    0,
    0,
    u32(0), // pre_defined
    ascii('vide'),
    zeros(12), // reserved
    ascii('VideoHandler\0')
  );
  const vmhd = fullBox('vmhd', 0, 1, u16(0), zeros(6));
  const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
  const avcC = box(
    'avcC',
    u8(1), // configurationVersion
    u8(SPS[1]), // AVCProfileIndication
    u8(SPS[2]), // profile_compatibility
    u8(SPS[3]), // AVCLevelIndication
    u8(0xff), // lengthSizeMinusOne 3
    u8(0xe1), // one SPS
    u16(SPS.length),
    Buffer.from(SPS),
    u8(1), // one PPS
    u16(PPS.length),
    Buffer.from(PPS)
  );
  const avc1 = box(
    'avc1',
    zeros(6), // reserved
    u16(1), // data_reference_index
    zeros(16), // pre_defined, reserved, pre_defined[3]
    u16(SIZE),
    u16(SIZE),
    u32(0x00480000), // horizresolution 72 dpi
    u32(0x00480000), // vertresolution 72 dpi
    u32(0), // reserved
    u16(1), // frame_count
    zeros(32), // compressorname
    u16(0x0018), // depth
    u16(0xffff), // pre_defined -1
    avcC
  );
  const stbl = box(
    'stbl',
    fullBox('stsd', 0, 0, u32(1), avc1),
    fullBox('stts', 0, 0, u32(1), u32(SAMPLES), u32(DURATION / SAMPLES)),
    // one sample per chunk, so every sample can start at the one frame
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
    fullBox('stsz', 0, 0, u32(sampleSize), u32(SAMPLES)),
    fullBox('stco', 0, 0, u32(SAMPLES), ...Array.from({ length: SAMPLES }, () => u32(chunkOffset)))
  );
  const minf = box('minf', vmhd, dinf, stbl);
  const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, minf));
  return box('moov', mvhd, trak);
}

export function mp4(): Buffer {
  const nal = idrSlice();
  const sample = Buffer.concat([u32(nal.length), nal]);
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'));
  // The chunk offset depends only on box sizes, which do not depend on its value.
  const moovSize = moov(sample.length, 0).length;
  const chunkOffset = ftyp.length + moovSize + 8;
  return Buffer.concat([ftyp, moov(sample.length, chunkOffset), box('mdat', sample)]);
}

// ---------------------------------------------------------------------------------------------

function parseOut(argv: readonly string[]): string {
  const i = argv.indexOf('--out');
  if (i === -1) return DEFAULT_OUT;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    process.stderr.write('usage: tsx evals/mcp/generate-media.ts [--out <dir>]\n');
    process.exit(2);
  }
  return path.resolve(value);
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const out = parseOut(process.argv.slice(2));
  fs.mkdirSync(out, { recursive: true });
  for (const [name, bytes] of [
    ['intro.mp4', mp4()],
    ['song.mp3', mp3()],
  ] as const) {
    const file = path.join(out, name);
    fs.writeFileSync(file, bytes);
    process.stdout.write(`${file} ${bytes.length} bytes\n`);
  }
}
