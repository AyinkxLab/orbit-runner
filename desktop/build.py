"""Build a standalone Orbit Runner executable for the current OS.

Install the build dependency first:
    pip install -r desktop/requirements-build.txt

Run from the repository root:
    python desktop/build.py

Output:
    dist/OrbitRunner.exe    on Windows
    dist/OrbitRunner.app    on macOS (plus a Unix binary)
    dist/OrbitRunner        on Linux
"""
import os
import sys

import PyInstaller.__main__

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main():
    args = [
        os.path.join(HERE, "orbit_runner.py"),
        "--name=OrbitRunner",
        "--onefile",
        "--windowed",
        "--noconfirm",
        "--clean",
        f"--distpath={os.path.join(ROOT, 'dist')}",
        f"--workpath={os.path.join(ROOT, 'build')}",
        f"--specpath={os.path.join(ROOT, 'build')}",
    ]
    print("Building Orbit Runner for", sys.platform)
    PyInstaller.__main__.run(args)
    print("Done. Output is in", os.path.join(ROOT, "dist"))


if __name__ == "__main__":
    main()
