# Test Media Files

This directory contains test media files for preview testing.

## Required Files

For manual testing of the preview feature, you'll need:

### test-video.mp4
- Small MP4 video file (<1MB)
- Duration: 5 seconds minimum
- Resolution: 320x240 or similar small size
- Can be generated with ffmpeg:
  ```bash
  ffmpeg -f lavfi -i color=c=blue:s=320x240:d=5 -f lavfi -i sine=frequency=440:duration=5 test-video.mp4
  ```
- Or download any short test video and rename it

### test-audio.mp3
- Small MP3 audio file (<500KB)
- Duration: 5 seconds minimum
- Can be generated with ffmpeg:
  ```bash
  ffmpeg -f lavfi -i sine=frequency=440:duration=5 test-audio.mp3
  ```
- Or use any short audio clip

### test-image.jpg
- Small JPEG image (<100KB)
- Any resolution
- Can be any test image

## Note

These files are not committed to the repository due to size constraints.
For CI/CD testing, these files can be generated in the build pipeline or
tests can be skipped if media files are not present.

## Alternative: Public URLs

For testing without local files, you can also use public URLs:
- Video: https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
- Audio: https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3
