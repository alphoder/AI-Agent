"""RAG (Retrieval-Augmented Generation) module.

Handles vector search against Pinecone for relevant context retrieval.
"""
from __future__ import annotations

import openai
import structlog
from pinecone import Pinecone

from src.config import settings

logger = structlog.get_logger(__name__)


class RAGRetriever:
    """Vector similarity search for knowledge base retrieval."""

    def __init__(self):
        self._openai_client: openai.AsyncOpenAI | None = None
        self._pc: Pinecone | None = None
        self._index = None
        self.embedding_model = "text-embedding-3-small"
        self.embedding_dims = 1536

    @property
    def openai_client(self) -> openai.AsyncOpenAI:
        if self._openai_client is None:
            self._openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        return self._openai_client

    @property
    def pc(self) -> Pinecone:
        if self._pc is None:
            self._pc = Pinecone(api_key=settings.pinecone_api_key)
        return self._pc

    @property
    def index(self):
        if self._index is None:
            self._index = self.pc.Index(settings.pinecone_index)
        return self._index

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a text using text-embedding-3-small."""
        response = await self.openai_client.embeddings.create(
            input=text,
            model=self.embedding_model,
        )
        return response.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts (max 100 per call)."""
        all_embeddings = []
        for i in range(0, len(texts), 100):
            batch = texts[i : i + 100]
            response = await self.openai_client.embeddings.create(
                input=batch,
                model=self.embedding_model,
            )
            all_embeddings.extend([d.embedding for d in response.data])

        logger.info("embed_batch", count=len(texts), batches=(len(texts) + 99) // 100)
        return all_embeddings

    async def store_chunks(
        self,
        chunks: list[dict],
        tenant_id: str,
        persona_id: str,
    ) -> int:
        """Embed and store document chunks in Pinecone."""
        if not chunks:
            return 0

        texts = [c["text"] for c in chunks]
        embeddings = await self.embed_batch(texts)

        namespace = f"{tenant_id}:{persona_id}"
        vectors = []

        for chunk, embedding in zip(chunks, embeddings):
            vector_id = f"{chunk['metadata'].get('document_id', 'doc')}_{chunk['chunk_index']}"
            vectors.append({
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "tenant_id": tenant_id,
                    "persona_id": persona_id,
                    "document_id": chunk["metadata"].get("document_id", ""),
                    "chunk_index": chunk["chunk_index"],
                    "text": chunk["text"][:1000],  # Pinecone metadata limit
                    "source_filename": chunk["metadata"].get("source_filename", ""),
                },
            })

        # Upsert in batches of 100
        for i in range(0, len(vectors), 100):
            batch = vectors[i : i + 100]
            self.index.upsert(vectors=batch, namespace=namespace)

        logger.info(
            "store_chunks",
            count=len(vectors),
            namespace=namespace,
        )
        return len(vectors)

    async def delete_document_vectors(
        self,
        document_id: str,
        tenant_id: str,
        persona_id: str,
    ) -> None:
        """Delete all vectors for a document from Pinecone."""
        namespace = f"{tenant_id}:{persona_id}"
        # Delete by metadata filter
        self.index.delete(
            filter={"document_id": document_id},
            namespace=namespace,
        )
        logger.info("delete_vectors", document_id=document_id, namespace=namespace)

    async def retrieve(
        self,
        query: str,
        tenant_id: str,
        persona_id: str,
        top_k: int = 5,
        similarity_threshold: float = 0.70,
    ) -> list[dict]:
        """Retrieve relevant chunks from vector store."""
        logger.info(
            "rag_retrieve",
            tenant_id=tenant_id,
            persona_id=persona_id,
            top_k=top_k,
        )

        query_embedding = await self.embed_text(query)
        namespace = f"{tenant_id}:{persona_id}"

        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            namespace=namespace,
            include_metadata=True,
        )

        # Filter by similarity threshold
        relevant = []
        for match in results.matches:
            if match.score >= similarity_threshold:
                relevant.append({
                    "text": match.metadata.get("text", ""),
                    "score": match.score,
                    "source_filename": match.metadata.get("source_filename", ""),
                    "chunk_index": match.metadata.get("chunk_index", 0),
                    "document_id": match.metadata.get("document_id", ""),
                })

        logger.info(
            "rag_results",
            total_matches=len(results.matches),
            above_threshold=len(relevant),
        )
        return relevant

    def format_context(self, chunks: list[dict]) -> str:
        """Format retrieved chunks as context for LLM prompt."""
        if not chunks:
            return ""

        context_parts = ["Reference material (use only if relevant):"]

        for i, chunk in enumerate(chunks, 1):
            source = chunk.get("source_filename", "Unknown")
            score = chunk.get("score", 0)
            context_parts.append(
                f"\n[Source {i}: {source} (relevance: {score:.2f})]\n{chunk['text']}"
            )

        return "\n".join(context_parts)
