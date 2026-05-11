#!/usr/bin/env python3
"""Write standard tags to an M4A or MP3 file. Called by the Electron main process.

Usage: python tag_writer.py <file_path> <json_tags>
json_tags keys: title, artist, album, year  (all optional)
"""

import json
import sys
from pathlib import Path


def write_m4a(path: str, tags: dict) -> None:
    from mutagen.mp4 import MP4
    audio = MP4(path)
    if "title"  in tags: audio["\xa9nam"] = [tags["title"]]
    if "artist" in tags: audio["\xa9ART"] = [tags["artist"]]
    if "album"  in tags: audio["\xa9alb"] = [tags["album"]]
    if "year"   in tags: audio["\xa9day"] = [str(tags["year"])]
    audio.save()


def write_mp3(path: str, tags: dict) -> None:
    from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC, error as ID3Error
    try:
        audio = ID3(path)
    except ID3Error:
        from mutagen.mp3 import MP3
        mp3 = MP3(path)
        mp3.add_tags()
        audio = mp3.tags
    if "title"  in tags: audio["TIT2"] = TIT2(encoding=3, text=tags["title"])
    if "artist" in tags: audio["TPE1"] = TPE1(encoding=3, text=tags["artist"])
    if "album"  in tags: audio["TALB"] = TALB(encoding=3, text=tags["album"])
    if "year"   in tags: audio["TDRC"] = TDRC(encoding=3, text=str(tags["year"]))
    audio.save(path)


def main():
    if len(sys.argv) < 3:
        print("Usage: tag_writer.py <file_path> <json_tags>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    tags = json.loads(sys.argv[2])
    ext = Path(file_path).suffix.lower()

    if ext == ".m4a":
        write_m4a(file_path, tags)
    elif ext == ".mp3":
        write_mp3(file_path, tags)
    else:
        print(f"Unsupported format: {ext}", file=sys.stderr)
        sys.exit(1)

    print("OK")


if __name__ == "__main__":
    main()
