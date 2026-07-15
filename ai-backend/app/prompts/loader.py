"""
Loads prompt text files from disk and caches them in memory.
Prompts live as plain .md/.txt files under app/prompts/<feature>/,
never hardcoded as Python strings, so PMs/domain experts can edit them
without touching code.
"""
from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent


@lru_cache(maxsize=32)
def load_prompt(relative_path: str) -> str:
    """
    relative_path example: "bcs/bcs_system_prompt.md"
    """
    path = PROMPTS_DIR / relative_path
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8").strip()
