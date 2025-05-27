from .llm import gemini_llm
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from .retrieval import get_vectorstore, sync_courses_to_qdrant, get_vectorstore_lectures
from langchain.chains import RetrievalQA
from .prompts import courses_prompt, condense_prompt, lectures_prompt
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
# from langchain.retrievers.self_query.base import SelfQueryRetriever
# from langchain.retrievers.self_query.qdrant import QdrantTranslator
client = qdrant_client.QdrantClient(QDRANT_HOST, api_key=QDRANT_API_KEY)

vector_store = get_vectorstore()
vector_store_lecture = get_vectorstore_lectures()
memory = ConversationBufferMemory(
    memory_key="chat_history",
    return_messages=True,
    output_key="answer"
)

memory_lecture = ConversationBufferMemory(
    memory_key="chat_history",
    return_messages=True,
    output_key="answer"
)

qa_chain = ConversationalRetrievalChain.from_llm(
    llm=gemini_llm,
    retriever=vector_store.as_retriever(search_kwargs={"k": 5}),
    memory=memory,
    condense_question_prompt=condense_prompt,  
    combine_docs_chain_kwargs={
        "prompt": courses_prompt  
    },
    return_source_documents=True
)

def bulid_qa_chain(lecture_id: int):
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
        memory=memory_lecture,
        condense_question_prompt=condense_prompt,  
        combine_docs_chain_kwargs={
            "prompt": lectures_prompt
        },
        return_source_documents=True
    )

def get_chat_response_lecture(user_input: str, lecture_id: int) -> str:
    print(f"\n[DEBUG] Sample points from Qdrant for LectureID={lecture_id}")
    points, _ = client.scroll(
        collection_name=QDRANT_COLLECTION_NAME_LECTURES,
        limit=10,
        with_payload=True,
        with_vectors=False,
        scroll_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="metadata.LectureID",
                    match=models.MatchValue(value=lecture_id)
                )
            ]
        )
    )
    print(points[0].payload)
    qa_chain_lecture = bulid_qa_chain(lecture_id)
    response = qa_chain_lecture({"question": user_input})
    print(lecture_id)
    print()
    print("Source Documents:")
    for i, doc in enumerate(response["source_documents"], start=1):
        cid = doc.metadata.get("LectureID", "N/A")
        content = doc.page_content
        print(f"{i}. CourseID={cid}\n   {content}\n")
    return response["answer"]

def get_chat_response(user_input: str) -> str:
    response = qa_chain({"question": user_input})
    print("Source Documents:")
    for i, doc in enumerate(response["source_documents"], start=1):
        cid = doc.metadata.get("CourseID", "N/A")
        content = doc.page_content
        print(f"{i}. CourseID={cid}\n   {content}\n")
    return response["answer"]

def clear_chat_history():
    """Clear the conversation memory for general chat"""
    memory.clear()
    return {"status": "success", "message": "Chat history cleared"}

def clear_lecture_chat_history():
    """Clear the conversation memory for lecture-specific chat"""
    memory_lecture.clear()
    return {"status": "success", "message": "Lecture chat history cleared"}
