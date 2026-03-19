"""Document processing and chunking.

Handles text extraction from PDF/DOCX/TXT/MD and splits into chunks
for embedding using RecursiveCharacterTextSplitter.
"""
from __future__ import annotations

import io
import re

import structlog
import tiktoken
from PyPDF2 import PdfReader
from docx import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = structlog.get_logger(__name__)

# Use cl100k_base tokenizer (GPT-4 family)
TOKENIZER = tiktoken.get_encoding("cl100k_base")


class DocumentChunker:
    """Extract text from documents and split into chunks for embedding."""

    def __init__(self, chunk_size: int = 512, chunk_overlap: int = 64):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name="cl100k_base",
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

    async def extract_text(self, file_bytes: bytes, file_type: str) -> str:
        """Extract text from a document file."""
        logger.info("extract_text", file_type=file_type, size=len(file_bytes))

        if file_type == "pdf":
            return self._extract_pdf(file_bytes)
        elif file_type == "docx":
            return self._extract_docx(file_bytes)
        elif file_type in ("txt", "md"):
            return file_bytes.decode("utf-8", errors="replace")
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

    def _extract_pdf(self, file_bytes: bytes) -> str:
        """Extract text from PDF using PyPDF2."""
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages)

    def _extract_docx(self, file_bytes: bytes) -> str:
        """Extract text from DOCX using python-docx."""
        doc = Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)

    def chunk_text(self, text: str, metadata: dict) -> list[dict]:
        """Split text into chunks with metadata."""
        # Clean text
        cleaned = self._clean_text(text)

        if not cleaned.strip():
            logger.warn("chunk_text_empty", metadata=metadata)
            return []

        # Split into chunks
        chunks = self.splitter.split_text(cleaned)

        logger.info(
            "chunk_text_complete",
            text_length=len(cleaned),
            chunk_count=len(chunks),
        )

        results = []
        for i, chunk in enumerate(chunks):
            token_count = len(TOKENIZER.encode(chunk))
            results.append({
                "text": chunk,
                "chunk_index": i,
                "token_count": token_count,
                "metadata": {
                    **metadata,
                    "chunk_index": i,
                    "text_snippet": chunk[:200],
                },
            })

        return results

    def _clean_text(self, text: str) -> str:
        """Clean extracted text."""
        # Remove excessive whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)
        # Remove control characters except newlines and tabs
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        return text.strip()

    def count_tokens(self, text: str) -> int:
        """Count tokens using tiktoken cl100k_base."""
        return len(TOKENIZER.encode(text))
