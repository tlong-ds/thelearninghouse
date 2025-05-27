import google.generativeai as genai
from langchain.llms.base import LLM
from typing import Optional, List
from .config import GEMINI_API_KEY, MODEL_NAME

genai.configure(api_key=GEMINI_API_KEY)

class GeminiWrapper(LLM):
    """Wrapper để sử dụng Gemini với LangChain."""
    
    model: str = MODEL_NAME

    def _call(self, prompt: str, stop: Optional[List[str]] = None) -> str:
        """Gửi prompt đến Gemini và trả về kết quả."""
        model = genai.GenerativeModel(self.model)
        response = model.generate_content(prompt)
        return response.text if response and hasattr(response, 'text') else "Không có phản hồi từ Gemini."

    @property
    def _identifying_params(self) -> dict:
        """Trả về tham số nhận diện của mô hình."""
        return {"model": self.model}
    
    @property
    def _llm_type(self) -> str:
        return "gemini"

gemini_llm = GeminiWrapper()

