"""Tests for the RAG retriever module."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock


class TestEmbedding:
    """Tests for embedding generation."""

    @pytest.mark.asyncio
    async def test_embed_text_calls_openai(self):
        """Should call OpenAI embeddings API and return the embedding vector."""
        mock_embedding = [0.1] * 1536
        mock_response = MagicMock()
        mock_data_item = MagicMock()
        mock_data_item.embedding = mock_embedding
        mock_response.data = [mock_data_item]

        with patch("src.core.rag.settings") as mock_settings, \
             patch("src.core.rag.Pinecone") as mock_pc_cls, \
             patch("src.core.rag.openai.AsyncOpenAI") as mock_openai_cls:

            mock_settings.openai_api_key = "test-key"
            mock_settings.pinecone_api_key = "test-pc-key"
            mock_settings.pinecone_index = "test-index"

            mock_openai = MagicMock()
            mock_openai.embeddings.create = AsyncMock(return_value=mock_response)
            mock_openai_cls.return_value = mock_openai

            mock_pc = MagicMock()
            mock_pc.Index.return_value = MagicMock()
            mock_pc_cls.return_value = mock_pc

            from src.core.rag import RAGRetriever
            retriever = RAGRetriever()
            result = await retriever.embed_text("test query")

        assert result == mock_embedding
        mock_openai.embeddings.create.assert_called_once_with(
            input="test query",
            model="text-embedding-3-small",
        )


class TestVectorRetrieval:
    """Tests for vector retrieval from Pinecone."""

    @pytest.mark.asyncio
    async def test_retrieve_returns_filtered_results(self):
        """Should return only matches above the similarity threshold."""
        mock_embedding = [0.1] * 1536

        # Create mock matches
        match_high = MagicMock()
        match_high.score = 0.85
        match_high.metadata = {
            "text": "Relevant content",
            "source_filename": "doc.pdf",
            "chunk_index": 0,
            "document_id": "doc1",
        }

        match_low = MagicMock()
        match_low.score = 0.50
        match_low.metadata = {
            "text": "Irrelevant content",
            "source_filename": "other.pdf",
            "chunk_index": 1,
            "document_id": "doc2",
        }

        mock_query_result = MagicMock()
        mock_query_result.matches = [match_high, match_low]

        with patch("src.core.rag.settings") as mock_settings, \
             patch("src.core.rag.Pinecone") as mock_pc_cls, \
             patch("src.core.rag.openai.AsyncOpenAI") as mock_openai_cls:

            mock_settings.openai_api_key = "test-key"
            mock_settings.pinecone_api_key = "test-pc-key"
            mock_settings.pinecone_index = "test-index"

            # Mock OpenAI embeddings
            mock_embed_response = MagicMock()
            mock_embed_data = MagicMock()
            mock_embed_data.embedding = mock_embedding
            mock_embed_response.data = [mock_embed_data]

            mock_openai = MagicMock()
            mock_openai.embeddings.create = AsyncMock(return_value=mock_embed_response)
            mock_openai_cls.return_value = mock_openai

            # Mock Pinecone
            mock_index = MagicMock()
            mock_index.query.return_value = mock_query_result

            mock_pc = MagicMock()
            mock_pc.Index.return_value = mock_index
            mock_pc_cls.return_value = mock_pc

            from src.core.rag import RAGRetriever
            retriever = RAGRetriever()
            results = await retriever.retrieve(
                query="test query",
                tenant_id="tenant1",
                persona_id="persona1",
                top_k=5,
                similarity_threshold=0.70,
            )

        # Only the high-score match should be returned
        assert len(results) == 1
        assert results[0]["text"] == "Relevant content"
        assert results[0]["score"] == 0.85
        assert results[0]["source_filename"] == "doc.pdf"

    @pytest.mark.asyncio
    async def test_retrieve_uses_correct_namespace(self):
        """Pinecone query should use namespace 'tenant_id:persona_id'."""
        mock_embedding = [0.1] * 1536

        mock_query_result = MagicMock()
        mock_query_result.matches = []

        with patch("src.core.rag.settings") as mock_settings, \
             patch("src.core.rag.Pinecone") as mock_pc_cls, \
             patch("src.core.rag.openai.AsyncOpenAI") as mock_openai_cls:

            mock_settings.openai_api_key = "test-key"
            mock_settings.pinecone_api_key = "test-pc-key"
            mock_settings.pinecone_index = "test-index"

            mock_embed_response = MagicMock()
            mock_embed_data = MagicMock()
            mock_embed_data.embedding = mock_embedding
            mock_embed_response.data = [mock_embed_data]

            mock_openai = MagicMock()
            mock_openai.embeddings.create = AsyncMock(return_value=mock_embed_response)
            mock_openai_cls.return_value = mock_openai

            mock_index = MagicMock()
            mock_index.query.return_value = mock_query_result

            mock_pc = MagicMock()
            mock_pc.Index.return_value = mock_index
            mock_pc_cls.return_value = mock_pc

            from src.core.rag import RAGRetriever
            retriever = RAGRetriever()
            await retriever.retrieve(
                query="test",
                tenant_id="acme",
                persona_id="sales-rep",
            )

        mock_index.query.assert_called_once()
        call_kwargs = mock_index.query.call_args.kwargs
        assert call_kwargs["namespace"] == "acme:sales-rep"


class TestSimilarityThreshold:
    """Tests for similarity threshold filtering."""

    @pytest.mark.asyncio
    async def test_all_below_threshold_returns_empty(self):
        """When all matches are below the threshold, return empty list."""
        mock_embedding = [0.1] * 1536

        match1 = MagicMock()
        match1.score = 0.50
        match1.metadata = {"text": "Low relevance", "source_filename": "a.pdf",
                           "chunk_index": 0, "document_id": "d1"}

        mock_query_result = MagicMock()
        mock_query_result.matches = [match1]

        with patch("src.core.rag.settings") as mock_settings, \
             patch("src.core.rag.Pinecone") as mock_pc_cls, \
             patch("src.core.rag.openai.AsyncOpenAI") as mock_openai_cls:

            mock_settings.openai_api_key = "test-key"
            mock_settings.pinecone_api_key = "test-pc-key"
            mock_settings.pinecone_index = "test-index"

            mock_embed_response = MagicMock()
            mock_embed_data = MagicMock()
            mock_embed_data.embedding = mock_embedding
            mock_embed_response.data = [mock_embed_data]

            mock_openai = MagicMock()
            mock_openai.embeddings.create = AsyncMock(return_value=mock_embed_response)
            mock_openai_cls.return_value = mock_openai

            mock_index = MagicMock()
            mock_index.query.return_value = mock_query_result

            mock_pc = MagicMock()
            mock_pc.Index.return_value = mock_index
            mock_pc_cls.return_value = mock_pc

            from src.core.rag import RAGRetriever
            retriever = RAGRetriever()
            results = await retriever.retrieve(
                query="test",
                tenant_id="t1",
                persona_id="p1",
                similarity_threshold=0.70,
            )

        assert results == []


class TestFormatContext:
    """Tests for format_context output formatting."""

    def test_format_context_with_chunks(self):
        """Should produce formatted output with source attribution."""
        with patch("src.core.rag.settings") as mock_settings, \
             patch("src.core.rag.Pinecone") as mock_pc_cls, \
             patch("src.core.rag.openai.AsyncOpenAI"):

            mock_settings.openai_api_key = "k"
            mock_settings.pinecone_api_key = "k"
            mock_settings.pinecone_index = "idx"

            mock_pc = MagicMock()
            mock_pc.Index.return_value = MagicMock()
            mock_pc_cls.return_value = mock_pc

            from src.core.rag import RAGRetriever
            retriever = RAGRetriever()

        chunks = [
            {"text": "First chunk text", "score": 0.92, "source_filename": "manual.pdf"},
            {"text": "Second chunk text", "score": 0.85, "source_filename": "guide.docx"},
        ]
        result = retriever.format_context(chunks)

        assert "Reference material" in result
        assert "[Source 1: manual.pdf (relevance: 0.92)]" in result
        assert "First chunk text" in result
        assert "[Source 2: guide.docx (relevance: 0.85)]" in result
        assert "Second chunk text" in result

    def test_format_context_empty_chunks(self):
        """Empty chunks list should return empty string."""
        with patch("src.core.rag.settings") as mock_settings, \
             patch("src.core.rag.Pinecone") as mock_pc_cls, \
             patch("src.core.rag.openai.AsyncOpenAI"):

            mock_settings.openai_api_key = "k"
            mock_settings.pinecone_api_key = "k"
            mock_settings.pinecone_index = "idx"

            mock_pc = MagicMock()
            mock_pc.Index.return_value = MagicMock()
            mock_pc_cls.return_value = mock_pc

            from src.core.rag import RAGRetriever
            retriever = RAGRetriever()

        result = retriever.format_context([])
        assert result == ""
