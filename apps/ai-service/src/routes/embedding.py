"""Embedding routes for document processing pipeline."""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import httpx
import structlog

from src.config import settings
from src.core.chunker import DocumentChunker
from src.core.rag import RAGRetriever

logger = structlog.get_logger(__name__)
router = APIRouter()

chunker = DocumentChunker(chunk_size=512, chunk_overlap=64)
rag = RAGRetriever()


class EmbeddingRequest(BaseModel):
    tenant_id: str
    persona_id: str
    document_id: str
    s3_key: str
    file_type: str
    original_filename: str = ""
    reprocess: bool = False


class DeleteRequest(BaseModel):
    tenant_id: str
    persona_id: str
    document_id: str


async def _process_document(req: EmbeddingRequest):
    """Background task: download, extract, chunk, embed, store."""
    try:
        # Notify API: processing started
        await _update_document_status(
            req.document_id, "processing", started=True
        )

        # Download from S3
        async with httpx.AsyncClient() as client:
            # Get file from S3 via presigned URL or direct access
            s3_url = f"{settings.s3_endpoint}/{settings.s3_bucket}/{req.s3_key}"
            response = await client.get(s3_url)
            file_bytes = response.content

        # Extract text
        text = await chunker.extract_text(file_bytes, req.file_type)

        if not text.strip():
            await _update_document_status(
                req.document_id, "failed", error="No text content extracted"
            )
            return

        # Chunk text
        chunks = chunker.chunk_text(text, {
            "document_id": req.document_id,
            "source_filename": req.original_filename,
            "tenant_id": req.tenant_id,
            "persona_id": req.persona_id,
        })

        if not chunks:
            await _update_document_status(
                req.document_id, "failed", error="No chunks generated"
            )
            return

        # If reprocessing, delete old vectors first
        if req.reprocess:
            await rag.delete_document_vectors(
                req.document_id, req.tenant_id, req.persona_id
            )

        # Embed and store in Pinecone
        stored_count = await rag.store_chunks(chunks, req.tenant_id, req.persona_id)

        total_tokens = sum(c["token_count"] for c in chunks)

        # Update document status
        await _update_document_status(
            req.document_id,
            "complete",
            chunk_count=stored_count,
            total_tokens=total_tokens,
        )

        logger.info(
            "document_processed",
            document_id=req.document_id,
            chunks=stored_count,
            tokens=total_tokens,
        )

    except Exception as e:
        logger.error(
            "document_processing_failed",
            document_id=req.document_id,
            error=str(e),
        )
        await _update_document_status(
            req.document_id, "failed", error=str(e)
        )


async def _update_document_status(
    document_id: str,
    status: str,
    error: str | None = None,
    chunk_count: int | None = None,
    total_tokens: int | None = None,
    started: bool = False,
):
    """Notify the API gateway of document processing status changes."""
    try:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{settings.api_gateway_url}/api/internal/documents/{document_id}/status",
                json={
                    "embedding_status": status,
                    "embedding_error": error,
                    "chunk_count": chunk_count,
                    "total_tokens": total_tokens,
                    "processing_started": started,
                },
                timeout=10.0,
            )
    except Exception as e:
        logger.error("status_update_failed", document_id=document_id, error=str(e))


@router.post("/create")
async def create_embedding(req: EmbeddingRequest, background_tasks: BackgroundTasks):
    """Process document and create vector embeddings (async)."""
    logger.info(
        "embedding_create_requested",
        document_id=req.document_id,
        file_type=req.file_type,
    )
    background_tasks.add_task(_process_document, req)
    return {"message": "Processing started", "document_id": req.document_id}


@router.post("/delete")
async def delete_embedding(req: DeleteRequest):
    """Delete all vectors for a document."""
    await rag.delete_document_vectors(
        req.document_id, req.tenant_id, req.persona_id
    )
    return {"message": "Vectors deleted", "document_id": req.document_id}
