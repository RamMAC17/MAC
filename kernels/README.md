# MAC Kernel Docker Images
# Build all kernel images for offline notebook execution.

# ── Build Commands ──
# Python (primary — with 80+ ML/DS/AI libraries):
#   docker build -t mac-kernel-python:latest -f Dockerfile.python .
#
# Node.js:
#   docker build -t mac-kernel-node:latest -f Dockerfile.node .
#
# C/C++:
#   docker build -t mac-kernel-gcc:latest -f Dockerfile.gcc .

# ── Quick Build All ──
# Run from this directory:
#   docker build -t mac-kernel-python:latest -f Dockerfile.python .
#   docker build -t mac-kernel-node:latest -f Dockerfile.node .
#   docker build -t mac-kernel-gcc:latest -f Dockerfile.gcc .

# ── Notes ──
# - Python image is ~4GB due to ML libraries (torch, tensorflow, etc.)
# - All images run as non-root user for security
# - Images are designed for --network none execution (fully offline)
# - Build these once on the server, then notebooks work without internet
