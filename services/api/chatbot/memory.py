from typing import Dict, Optional
from langchain.memory import ConversationBufferMemory

class MemoryManager:
    def __init__(self):
        self.user_memories: Dict[str, Dict[str, ConversationBufferMemory]] = {}
    
    def get_memory(self, user_id: str, context_id: Optional[str] = "general") -> ConversationBufferMemory:
        """Get or create a memory instance for a specific user and context.
        
        Args:
            user_id: The ID of the user
            context_id: The context identifier (e.g., "general" for course chat, or "lecture_{id}" for lecture chat)
        """
        if user_id not in self.user_memories:
            self.user_memories[user_id] = {}
        
        if context_id not in self.user_memories[user_id]:
            self.user_memories[user_id][context_id] = ConversationBufferMemory(
                memory_key="chat_history",
                return_messages=True,
                output_key="answer"
            )
        
        return self.user_memories[user_id][context_id]
    
    def clear_memory(self, user_id: str, context_id: Optional[str] = None):
        """Clear memory for a user.
        
        Args:
            user_id: The ID of the user
            context_id: If provided, only clear this specific context. Otherwise clear all contexts.
        """
        if user_id in self.user_memories:
            if context_id:
                if context_id in self.user_memories[user_id]:
                    self.user_memories[user_id][context_id].clear()
            else:
                # Clear all contexts for this user
                for mem in self.user_memories[user_id].values():
                    mem.clear()

# Global memory manager instance
memory_manager = MemoryManager()