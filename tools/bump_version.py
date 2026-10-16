"""Set the version of Zenith and Zenith Plus everywhere it is shown.

The VERSION file is the source (both share one version); this copies it
into the Plus script headers and the first lines of every readme. The
installer and -Update read VERSION themselves and write it into Zen's mod
list. Patch for fixes and tweaks, minor for new features.

Usage: python bump_version.py <zenith root> 0.6.0
"""
import re
import sys
from pathlib import Path


def main():
    root, version = Path(sys.argv[1]), sys.argv[2]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit("version must look like 1.2.3")
    (root / "VERSION").write_text(version + "\n", encoding="utf-8")

    for script in sorted((root / "plus" / "scripts").glob("*.uc.mjs")):
        text = script.read_text(encoding="utf-8")
        if "// @version" in text:
            text = re.sub(r"// @version\s+\S+", f"// @version        {version}", text)
        else:
            text = text.replace("// @include        main", f"// @include        main\n// @version        {version}", 1)
        script.write_text(text, encoding="utf-8")

    readmes = sorted((root / "mods").glob("*/readme.md")) + [root / "plus" / "readme.md"]
    for readme in readmes:
        if not readme.exists():
            continue
        lines = readme.read_text(encoding="utf-8").splitlines()
        body = [l for l in lines[1:] if not l.startswith("Version ")]
        while body and not body[0].strip():
            body.pop(0)
        readme.write_text("\n".join([lines[0], "", f"Version {version}", ""] + body) + "\n", encoding="utf-8")
    print(f"Zenith and Zenith Plus are now {version}")


if __name__ == "__main__":
    main()
