import os
from sentence_transformers import SentenceTransformer
from langchain_community.embeddings import HuggingFaceEmbeddings

# Set cache directories
os.environ['HF_HOME'] = '/tmp/huggingface'
os.environ['TRANSFORMERS_CACHE'] = '/tmp/transformers'
os.environ['SENTENCE_TRANSFORMERS_HOME'] = '/tmp/sentence-transformers'

# Initialize model singleton
def init_embedding_model():
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        cache_folder="/tmp/transformers",
        model_kwargs={'device': 'cpu'}  # Force CPU usage for better compatibility
    )

# Create global instance
embedding_model = init_embedding_model()