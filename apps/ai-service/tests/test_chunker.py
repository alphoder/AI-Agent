"""Tests for the document chunker module."""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock

from src.core.chunker import DocumentChunker


@pytest.fixture
def chunker():
    """Create a DocumentChunker with default parameters."""
    return DocumentChunker(chunk_size=512, chunk_overlap=64)


class TestTextSplitting:
    """Tests for text splitting via RecursiveCharacterTextSplitter."""

    def test_default_chunk_parameters(self):
        """Chunker should initialize with 512 token chunk size and 64 overlap."""
        chunker = DocumentChunker()
        assert chunker.chunk_size == 512
        assert chunker.chunk_overlap == 64

    def test_custom_chunk_parameters(self):
        """Chunker should accept custom chunk size and overlap."""
        chunker = DocumentChunker(chunk_size=256, chunk_overlap=32)
        assert chunker.chunk_size == 256
        assert chunker.chunk_overlap == 32

    def test_chunk_text_produces_chunks(self, chunker):
        """Splitting a long text should produce multiple chunks."""
        # Generate text long enough to produce multiple chunks
        long_text = "This is a sample sentence for testing. " * 200
        metadata = {"source_filename": "test.txt", "document_id": "doc1"}
        result = chunker.chunk_text(long_text, metadata)
        assert len(result) > 1

    def test_chunk_metadata_includes_source_and_position(self, chunker):
        """Each chunk should carry source metadata and chunk_index."""
        text = "This is some test content that should be chunked properly. " * 100
        metadata = {"source_filename": "report.pdf", "document_id": "doc-42"}
        result = chunker.chunk_text(text, metadata)

        assert len(result) >= 1
        first = result[0]
        assert first["chunk_index"] == 0
        assert "text" in first
        assert "token_count" in first
        assert first["metadata"]["source_filename"] == "report.pdf"
        assert first["metadata"]["document_id"] == "doc-42"
        assert first["metadata"]["chunk_index"] == 0
        assert "text_snippet" in first["metadata"]

    def test_chunk_indices_are_sequential(self, chunker):
        """Chunk indices should be sequential starting from 0."""
        text = "Testing chunk indices. " * 200
        result = chunker.chunk_text(text, {"source_filename": "test.txt"})
        indices = [c["chunk_index"] for c in result]
        assert indices == list(range(len(result)))


class TestEmptyDocument:
    """Tests for empty document handling."""

    def test_empty_string_returns_empty_list(self, chunker):
        """An empty string should produce no chunks."""
        result = chunker.chunk_text("", {"source_filename": "empty.txt"})
        assert result == []

    def test_whitespace_only_returns_empty_list(self, chunker):
        """A whitespace-only string should produce no chunks."""
        result = chunker.chunk_text("   \n\n\t  ", {"source_filename": "blank.txt"})
        assert result == []


class TestPdfExtraction:
    """Tests for PDF text extraction."""

    @pytest.mark.asyncio
    async def test_extract_pdf_text(self, chunker):
        """Should extract text from PDF bytes using PyPDF2."""
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Page one content."
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Page two content."

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]

        with patch("src.core.chunker.PdfReader", return_value=mock_reader):
            result = await chunker.extract_text(b"fake-pdf-bytes", "pdf")

        assert "Page one content." in result
        assert "Page two content." in result
        assert "\n\n" in result

    @pytest.mark.asyncio
    async def test_extract_pdf_skips_empty_pages(self, chunker):
        """Pages with no text should be excluded from the result."""
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Content here."
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = ""

        mock_reader = MagicMock()
        mock_reader.pages = [mock_page1, mock_page2]

        with patch("src.core.chunker.PdfReader", return_value=mock_reader):
            result = await chunker.extract_text(b"fake-pdf-bytes", "pdf")

        assert result == "Content here."


class TestDocxExtraction:
    """Tests for DOCX text extraction."""

    @pytest.mark.asyncio
    async def test_extract_docx_text(self, chunker):
        """Should extract text from DOCX bytes using python-docx."""
        mock_para1 = MagicMock()
        mock_para1.text = "First paragraph."
        mock_para2 = MagicMock()
        mock_para2.text = "Second paragraph."

        mock_doc = MagicMock()
        mock_doc.paragraphs = [mock_para1, mock_para2]

        with patch("src.core.chunker.Document", return_value=mock_doc):
            result = await chunker.extract_text(b"fake-docx-bytes", "docx")

        assert "First paragraph." in result
        assert "Second paragraph." in result

    @pytest.mark.asyncio
    async def test_extract_docx_skips_empty_paragraphs(self, chunker):
        """Empty paragraphs should be excluded."""
        mock_para1 = MagicMock()
        mock_para1.text = "Content."
        mock_empty = MagicMock()
        mock_empty.text = "   "

        mock_doc = MagicMock()
        mock_doc.paragraphs = [mock_para1, mock_empty]

        with patch("src.core.chunker.Document", return_value=mock_doc):
            result = await chunker.extract_text(b"fake-docx-bytes", "docx")

        assert result == "Content."


class TestPlainTextExtraction:
    """Tests for plain text and markdown extraction."""

    @pytest.mark.asyncio
    async def test_extract_txt(self, chunker):
        """Should decode UTF-8 text from bytes."""
        text_bytes = "Hello, world!".encode("utf-8")
        result = await chunker.extract_text(text_bytes, "txt")
        assert result == "Hello, world!"

    @pytest.mark.asyncio
    async def test_extract_md(self, chunker):
        """Should handle markdown files same as text."""
        md_bytes = "# Title\n\nSome content.".encode("utf-8")
        result = await chunker.extract_text(md_bytes, "md")
        assert result == "# Title\n\nSome content."

    @pytest.mark.asyncio
    async def test_unsupported_type_raises(self, chunker):
        """Unsupported file types should raise ValueError."""
        with pytest.raises(ValueError, match="Unsupported file type"):
            await chunker.extract_text(b"data", "xlsx")


class TestTokenCounting:
    """Tests for token counting utility."""

    def test_count_tokens_returns_positive_int(self, chunker):
        """Token count should be a positive integer for non-empty text."""
        count = chunker.count_tokens("Hello, how are you?")
        assert isinstance(count, int)
        assert count > 0

    def test_count_tokens_empty_string(self, chunker):
        """Empty string should have zero tokens."""
        count = chunker.count_tokens("")
        assert count == 0
