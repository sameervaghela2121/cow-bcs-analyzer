from fastapi import APIRouter

from app.api.endpoints import bcs

api_router = APIRouter(prefix="/api")
api_router.include_router(bcs.router)

# Future feature endpoints register here, e.g.:
# from app.api.endpoints import chapter_summarizer
# api_router.include_router(chapter_summarizer.router)
