"""Vercel Serverless Function entry point for Chronos Planner."""
import sys
from pathlib import Path

# Ensure root workspace directory is in python module search path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from main import app  # Export FastAPI instance for Vercel
