import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ToolCall {
  tool_name: string;
  tool_args?: any;
  status: 'started' | 'completed';
}

interface HelpCenterStore {
  // State
  isOpen: boolean;
  sessionId: string;
  messages: Message[];
  isLoading: boolean;
  currentStreamingMessage: string;
  currentToolCall: ToolCall | null;

  // Actions
  openModal: () => void;
  closeModal: () => void;
  toggleModal: () => void;
  sendMessage: (query: string) => Promise<void>;
  deleteSession: () => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  setCurrentStreamingMessage: (content: string) => void;
  clearStreamingMessage: () => void;
  setCurrentToolCall: (toolCall: ToolCall | null) => void;
}

export const useHelpCenterStore = create<HelpCenterStore>((set, get) => ({
  // Initial state
  isOpen: false,
  sessionId: uuidv4(),
  messages: [],
  isLoading: false,
  currentStreamingMessage: '',
  currentToolCall: null,

  // Open/close modal
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
  toggleModal: () => set((state) => ({ isOpen: !state.isOpen })),

  // Add message to history
  addMessage: (role, content) => {
    const message: Message = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date(),
    };
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  // Set streaming message (temporary, not saved to history yet)
  setCurrentStreamingMessage: (content) => {
    set({ currentStreamingMessage: content });
  },

  // Clear streaming message
  clearStreamingMessage: () => {
    set({ currentStreamingMessage: '' });
  },

  // Set current tool call
  setCurrentToolCall: (toolCall) => {
    set({ currentToolCall: toolCall });
  },

  // Delete session and start fresh
  deleteSession: () => {
    set({
      sessionId: uuidv4(),
      messages: [],
      currentStreamingMessage: '',
      currentToolCall: null,
      isLoading: false,
    });
  },

  // Send message to help center API
  sendMessage: async (query: string) => {
    const { sessionId, addMessage, setCurrentStreamingMessage, clearStreamingMessage, setCurrentToolCall } = get();

    // Add user message
    addMessage('user', query);
    set({ isLoading: true, currentStreamingMessage: '', currentToolCall: null });

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/help/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Handle SSE streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let assistantMessage = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new chunk to buffer
        buffer += decoder.decode(value, { stream: true });

        // Split by double newline (SSE message separator)
        const messages = buffer.split('\n\n');

        // Keep the last incomplete message in the buffer
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE message (format: "event: type\ndata: json")
          const lines = message.split('\n');
          let eventType = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              data = line.slice(6);
            }
          }

          if (data === '[DONE]') {
            // Stream complete - save final message
            if (assistantMessage) {
              addMessage('assistant', assistantMessage);
              clearStreamingMessage();
            }
            setCurrentToolCall(null);
            set({ isLoading: false });
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // Handle different event types
            if (eventType === 'message.delta' && parsed.content) {
              assistantMessage += parsed.content;
              setCurrentStreamingMessage(assistantMessage);
            } else if (eventType === 'message.completed' && parsed.content) {
              // Don't add message here - we'll add it when stream ends
              assistantMessage = parsed.content;
            } else if (eventType === 'tool.started') {
              // Show tool call activity
              setCurrentToolCall({
                tool_name: parsed.tool_name,
                tool_args: parsed.tool_args,
                status: 'started',
              });
            } else if (eventType === 'tool.completed') {
              // Clear tool call when done
              setCurrentToolCall({
                tool_name: parsed.tool_name,
                tool_args: parsed.tool_args,
                status: 'completed',
              });
              // Clear after a short delay
              setTimeout(() => setCurrentToolCall(null), 500);
            } else if (eventType === 'error') {
              console.error('Stream error:', parsed.error);
              addMessage('assistant', `Error: ${parsed.error}`);
              clearStreamingMessage();
              setCurrentToolCall(null);
              set({ isLoading: false });
              return;
            }
          } catch (e) {
            // Ignore parse errors for non-JSON data
            console.debug('SSE parse error:', e);
          }
        }
      }

      setCurrentToolCall(null);
      set({ isLoading: false });
    } catch (error) {
      console.error('Error sending message:', error);
      addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
      clearStreamingMessage();
      set({ isLoading: false });
    }
  },
}));
