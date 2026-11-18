"""Vendor the latest Allo webfont release into ``static/fonts/allo``.

Allo is not on Google Fonts, so the woff2 files are committed to the repo.
Re-run this after an Allo release to pick up fixes:

    python scripts/update_allo.py          # download the latest release
    python scripts/update_allo.py --check  # only report whether an update exists

Only the variable font and the two obliques the site uses are kept; the
3 MB release archive is not stored.
"""

import argparse
import hashlib
import io
import json
import os
import sys
import urllib.request
import zipfile

REPO = "joshpuckett/allo"
LATEST_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
SUMS_URL = f"https://raw.githubusercontent.com/{REPO}/{{tag}}/fonts/SHA256SUMS"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_DIR = os.path.join(BASE_DIR, "static", "fonts", "allo")
VERSION_FILE = os.path.join(TARGET_DIR, "VERSION")

# Release path suffix -> committed filename
FILES = {
    "fonts/webfonts/AlloVariable.woff2": "AlloVariable.woff2",
    "fonts/webfonts/Allo-Oblique.woff2": "Allo-Oblique.woff2",
    "fonts/webfonts/Allo-BoldOblique.woff2": "Allo-BoldOblique.woff2",
    "OFL.txt": "OFL.txt",
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def read_version():
    try:
        with open(VERSION_FILE, encoding="utf-8") as handle:
            return handle.read().strip()
    except FileNotFoundError:
        return None


def member_name(zip_names, suffix):
    matches = [name for name in zip_names if name.endswith(suffix)]
    if not matches:
        raise SystemExit(f"{suffix} is missing from the release archive")
    return matches[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report whether a newer release exists without downloading it",
    )
    args = parser.parse_args()

    release = json.loads(fetch(LATEST_URL))
    tag = release["tag_name"]
    current = read_version()

    if current == tag:
        print(f"Allo is up to date ({tag}).")
        return 0

    if args.check:
        print(f"Allo update available: {current or 'not vendored'} -> {tag}")
        return 1

    archive_url = release["assets"][0]["browser_download_url"]
    print(f"Downloading Allo {tag} from {archive_url}")
    archive = zipfile.ZipFile(io.BytesIO(fetch(archive_url)))

    names = archive.namelist()
    checksums = {}
    for line in fetch(SUMS_URL.format(tag=tag)).decode("utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2:
            checksums[parts[1].lstrip("./")] = parts[0]

    payloads = {}
    for suffix, filename in FILES.items():
        data = archive.read(member_name(names, suffix))
        if suffix.endswith(".woff2"):
            digest = hashlib.sha256(data).hexdigest()
            expected = checksums.get(suffix)
            if expected is None:
                raise SystemExit(f"No published checksum for {suffix}")
            if digest != expected:
                raise SystemExit(f"Checksum mismatch for {suffix}")
        payloads[filename] = data
        print(f"  {filename}: {len(data):,} bytes")

    os.makedirs(TARGET_DIR, exist_ok=True)
    for filename, data in payloads.items():
        with open(os.path.join(TARGET_DIR, filename), "wb") as handle:
            handle.write(data)
    with open(VERSION_FILE, "w", encoding="utf-8") as handle:
        handle.write(tag + "\n")

    print(f"Updated Allo to {tag}. Commit static/fonts/allo/ and bump the CSS version.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
