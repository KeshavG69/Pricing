'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Send } from 'lucide-react';
import { useHelpCenterStore } from '@/lib/stores/helpCenterStore';
import ReactMarkdown from 'react-markdown';

export default function HelpCenterModal() {
  const {
    isOpen,
    closeModal,
    messages,
    isLoading,
    currentStreamingMessage,
    currentToolCall,
    sendMessage,
    deleteSession,
  } = useHelpCenterStore();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingMessage, currentToolCall]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const query = inputValue.trim();
    setInputValue('');
    await sendMessage(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteSession = () => {
    deleteSession();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-2 md:right-4 top-20 bottom-4 w-[calc(100%-16px)] md:w-[500px] bg-card border border-border rounded-lg shadow-2xl z-40 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">?</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Help Center</h2>
              <p className="text-xs text-muted-foreground">Ask me anything about PriceIQ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Delete session button */}
            {messages.length > 0 && (
              <button
                onClick={handleDeleteSession}
                className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
                title="Delete session and start new"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {/* Close button */}
            <button
              onClick={closeModal}
              className="p-2 rounded-lg hover:bg-muted transition-all duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !currentStreamingMessage && (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-base">👋 Hi! I'm here to help you with PriceIQ.</p>
              <p className="text-sm mt-2">Ask me anything about creating proposals, pricing, or using the platform.</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-base dark:prose-invert max-w-none text-slate-900 dark:text-slate-100">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-base whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Tool call indicator */}
          {currentToolCall && (
            <div className="flex justify-start">
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-base text-primary font-medium">
                    {currentToolCall.tool_name === 'search_knowledge_base' && (
                      <>Searching {currentToolCall.tool_args?.query && `: "${currentToolCall.tool_args.query}"`}...</>
                    )}
                    {currentToolCall.tool_name !== 'search_knowledge_base' && (
                      <>⚙️ {currentToolCall.tool_name}...</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Streaming message */}
          {currentStreamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-3 bg-slate-100 dark:bg-slate-800">
                <div className="prose prose-base dark:prose-invert max-w-none text-slate-900 dark:text-slate-100">
                  <ReactMarkdown>{currentStreamingMessage}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && !currentStreamingMessage && !currentToolCall && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none text-base"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
    </div>
  );
}
