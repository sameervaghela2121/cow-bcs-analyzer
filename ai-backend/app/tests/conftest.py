"""
Ensures LLM provider constructors don't fail during tests due to missing
API keys. Tests mock `analyze_images`, but provider `__init__` still checks
for a configured key, so dummy values are set here before `app.main` (and
therefore `app.core.config.settings`) is imported.
"""
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-dummy-key")
os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key")
os.environ.setdefault("OPENAI_API_KEY", "test-dummy-key")
