from .llm import gemini_llm
from typing import Optional
from langchain.chains import ConversationalRetrievalChain
from .retrieval import get_vectorstore, sync_courses_to_qdrant, get_vectorstore_lectures
from langchain.chains import RetrievalQA
from .prompts import courses_prompt, condense_prompt, lectures_prompt
from .memory import memory_manager
from qdrant_client.http import models


import qdrant_client
from .config import (
    EMBEDDING_MODEL,
    QDRANT_HOST,
    QDRANT_API_KEY,
    QDRANT_COLLECTION_NAME,
    EMBEDDING_SIZE,
    QDRANT_COLLECTION_NAME_LECTURES,
)

client = qdrant_client.QdrantClient(QDRANT_HOST, api_key=QDRANT_API_KEY)

vector_store = get_vectorstore()
vector_store_lecture = get_vectorstore_lectures()

def get_qa_chain(user_id: str):
    """Get a QA chain for general course chat for a specific user."""
    memory = memory_manager.get_memory(user_id, "general")
    return ConversationalRetrievalChain.from_llm(
        llm=gemini_llm,
        retriever=vector_store.as_retriever(search_kwargs={"k": 5}),
        memory=memory,
        condense_question_prompt=condense_prompt,  
        combine_docs_chain_kwargs={
            "prompt": courses_prompt  
        },
        return_source_documents=True
    )

def bulid_qa_chain(user_id: str, lecture_id: int):
    """Get a QA chain for lecture-specific chat."""
    memory = memory_manager.get_memory(user_id, f"lecture_{lecture_id}")
    return ConversationalRetrievalChain.from_llm(
        llm=gemini_llm,
        retriever = vector_store_lecture.as_retriever(
            search_kwargs={
                "k": 5,
                "filter": models.Filter(
                    must=[
                        models.FieldCondition(
                            key="metadata.LectureID",
                            match=models.MatchValue(value=lecture_id),
                        )
                    ]
                )
            }
        ),
        memory=memory,
        condense_question_prompt=condense_prompt,  
        combine_docs_chain_kwargs={
            "prompt": lectures_prompt
        },
        return_source_documents=True
    )

def get_chat_response(user_id: str, user_input: str) -> str:
    """Get a response for general course chat."""
    qa_chain = get_qa_chain(user_id)
    response = qa_chain({"question": user_input})
    print("Source Documents:")
    for i, doc in enumerate(response["source_documents"], start=1):
        cid = doc.metadata.get("CourseID", "N/A")
        content = doc.page_content
        print(f"{i}. CourseID={cid}\n   {content}\n")
    return response["answer"]

def get_chat_response_lecture(user_id: str, user_input: str, lecture_id: int) -> str:
    """Get a response for lecture-specific chat."""
    qa_chain = bulid_qa_chain(user_id, lecture_id)
    response = qa_chain({"question": user_input})
    print("Source Documents:")
    for i, doc in enumerate(response["source_documents"], start=1):
        lid = doc.metadata.get("LectureID", "N/A")
        content = doc.page_content
        print(f"{i}. LectureID={lid}\n   {content}\n")
    return response["answer"]

def clear_chat_history(user_id: str):
    """Clear the conversation memory for general chat"""
    memory_manager.clear_memory(user_id, "general")
    return {"status": "success", "message": "Chat history cleared"}

def clear_lecture_chat_history(user_id: str, lecture_id: Optional[int] = None):
    """Clear the conversation memory for lecture-specific chat"""
    if lecture_id is not None:
        memory_manager.clear_memory(user_id, f"lecture_{lecture_id}")
    else:
        # Clear all lecture chats for this user
        memory_manager.clear_memory(user_id)
    return {"status": "success", "message": "Lecture chat history cleared"}
