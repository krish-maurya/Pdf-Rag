"use client"

import React, { useState, ChangeEvent, KeyboardEvent, useRef, useEffect } from 'react';
import { Upload, Sun, Moon, Send } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { Toaster } from 'sonner';
import { Document, Page } from "react-pdf";

import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

interface Message {
  type: 'user' | 'ai';
  text: string;
  docs?: any[];
}


interface Theme {
  bg: string;
  text: string;
  textSecondary: string;
  border: string;
  borderHover: string;
  cardBg: string;
  inputBg: string;
  buttonBg: string;
  buttonText: string;
  buttonHover: string;
  userMessageBg: string;
  aiMessageBg: string;
  sourceTagBg: string;
}

export default function Home() {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSources, setShowSources] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const formData = new FormData()
      formData.append('pdf', file);
      const url = URL.createObjectURL(file);
      setPdfUrl(url);

      const { data } = await axios.post(
        'http://localhost:8000/upload/pdf',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      if (data.success) {
        toast.success('Upload successful!')
      }

    }
  };

  const handleSendMessage = async () => {
    if (inputValue.trim()) {
      setMessages([...messages, { type: 'user', text: inputValue }]);
      setIsLoading(true);
      setInputValue('');

      try {
        const { data } = await axios.post('http://localhost:8000/search', { query: inputValue });

        if (data.success) {
          setMessages(prev => [...prev, {
            type: 'ai',
            text: data.message,
            docs: data.docs // Include source documents
          }]);

        }
      } catch (error) {
        console.error('Error:', error);
        setMessages(prev => [...prev, {
          type: 'ai',
          text: 'Sorry, there was an error processing your request.'
        }]);
      } finally {
        setIsLoading(false);
      }
    };
  }

  // Message Display Component

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const theme: Theme = {
    bg: isDark ? 'bg-black' : 'bg-white',
    text: isDark ? 'text-white' : 'text-black',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-600',
    border: isDark ? 'border-gray-800' : 'border-gray-200',
    borderHover: isDark ? 'hover:border-gray-700' : 'hover:border-gray-300',
    cardBg: isDark ? 'bg-gray-950' : 'bg-gray-50',
    inputBg: isDark ? 'bg-gray-950' : 'bg-white',
    buttonBg: isDark ? 'bg-white' : 'bg-black',
    buttonText: isDark ? 'text-black' : 'text-white',
    buttonHover: isDark ? 'hover:bg-gray-100' : 'hover:bg-gray-800',
    userMessageBg: isDark ? 'bg-gray-900' : 'bg-gray-100',
    aiMessageBg: isDark ? 'bg-gray-800' : 'bg-gray-200',
    sourceTagBg: isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700',
  };

  return (
    <div className={`w-full h-screen ${theme.bg} ${theme.text} transition-colors duration-300 overflow-hidden flex flex-col`}>
      <Toaster richColors theme={isDark ? 'dark' : 'light'} position='top-center' />
      {/* Header */}
      <header className={`w-full border-b ${theme.border} transition-colors duration-300 px-6 py-4`}>
        <h1 className="text-lg font-medium">PDF CHAT</h1>
      </header>

      {/* Main Layout */}
      <div className="w-full flex-1 flex overflow-hidden">
        {/* File Upload Section */}
        <div className={`w-2/5 border-r ${theme.border} p-4 transition-colors duration-300 flex flex-col`}>
          <h2 className="text-sm font-medium mb-3 tracking-wide uppercase">File Upload</h2>

          {!uploadedFile ? (
            <label className={`
              flex flex-col items-center justify-center flex-1
              border-2 border-dashed ${theme.border} ${theme.borderHover}
              rounded-lg cursor-pointer transition-all duration-200
            `}>
              <Upload size={48} className={theme.textSecondary} />
              <p className={`mt-4 text-sm ${theme.textSecondary}`}>
                Click to upload or drag and drop
              </p>
              <p className={`mt-1 text-xs ${theme.textSecondary}`}>
                Any text file
              </p>
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept="text/*,.json,.md,.txt,.js,.jsx,.ts,.tsx,.css,.html,.pdf"
              />
            </label>
          ) : (
            <div className="space-y-3 flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{uploadedFile.name}</p>
                  <p className={`text-xs ${theme.textSecondary}`}>
                    {(uploadedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                    setPdfUrl(null);
                    setUploadedFile(null);
                    setNumPages(0);
                  }}
                  className={`text-xs ${theme.textSecondary} hover:${theme.text} transition-colors`}
                >
                  Remove
                </button>
              </div>

              {/* File Preview - Fixed height 144px */}
              <div className={`
                ${theme.cardBg} border ${theme.border} rounded-lg p-3
                h-156 overflow-auto font-mono text-xs transition-colors duration-300 scrollbar-hide
              `}>
                {pdfUrl && (<Document
                  file={pdfUrl}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  loading={<p className="text-xs opacity-60">Loading PDF…</p>}
                >
                  {Array.from({ length: numPages }, (_, i) => (
                    <Page
                      key={i}
                      pageNumber={i + 1}
                      scale={0.9}
                      className="mb-3"
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  ))}
                </Document>)}
              </div>
            </div>
          )}
        </div>

        {/* Chat Section */}
        <div className={`flex-1 flex flex-col transition-colors duration-300`}>
          {/* Header with Messages title and Toggle */}
          <div className={`px-4 py-3 border-b ${theme.border} flex justify-between items-center`}>
            <h2 className="text-sm font-medium tracking-wide uppercase">Messages</h2>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-2 rounded-lg border ${theme.border} ${theme.borderHover} transition-all duration-200`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {/* Messages Container - Independently Scrollable with Custom Scrollbar */}
          <div className="flex-1 px-4 py-3 overflow-y-auto space-y-3 scrollbar-hide">
            {messages.length === 0 ? (
              <div className={`flex items-center justify-center h-full ${theme.textSecondary}`}>
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => {


                  return (
                    <div key={idx} className={`${msg.type === 'user' ? 'ml-auto' : 'mr-auto'} max-w-[80%]`}>

                      {/* Main Message Bubble */}
                      <div
                        className={`
                p-3 rounded-lg text-sm
                ${msg.type === 'user' ? theme.userMessageBg : theme.aiMessageBg}
                transition-colors duration-300
              `}
                      >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>

                      {/* Sources Section (AI only) */}
                      {msg.type === 'ai' && msg.docs && msg.docs.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => setShowSources(!showSources)}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800"
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${showSources ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                            {msg.docs.length} Source{msg.docs.length > 1 ? 's' : ''} Referenced
                          </button>

                          {showSources && (
                            <div className="mt-3 space-y-3">
                              {msg.docs.map((doc, i) => (
                                <div
                                  key={i}
                                  className={`border ${theme.border} rounded-lg p-3 ${theme.bg} shadow-sm`}
                                >
                                  {/* Source Header */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`${theme.sourceTagBg} text-white px-2 py-0.5 rounded text-xs font-semibold`}>
                                      Source {i + 1}
                                    </span>
                                    <span className={`text-xs ${theme.textSecondary}`}>
                                      📄 {doc.metadata.source.split('\\').pop()}
                                    </span>
                                  </div>

                                  {/* Metadata */}
                                  <div className={`flex gap-3 mb-2 text-xs ${theme.textSecondary}`}>
                                    <span>
                                      Page: {doc.metadata.loc.pageNumber}
                                    </span>
                                    <span>
                                      Lines: {doc.metadata.loc.lines.from}–
                                      {doc.metadata.loc.lines.to}
                                    </span>
                                  </div>

                                  {/* Content */}
                                  <div className={` p-2 rounded border-l-4 border-blue-400 ${theme.bg}`}>
                                    <p className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                                      {doc.pageContent}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isLoading && (
                  <div className="mr-auto max-w-[80%]">
                    <div className={`${theme.textSecondary} text-sm`}>Thinking
                      <span className="inline-flex gap-1 ml-1">
                        <span className="animate-pulse">.</span>
                        <span className="animate-pulse delay-150">.</span>
                        <span className="animate-pulse delay-300">.</span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>


          {/* Message Input */}
          <div className={`px-4 py-3 border-t ${theme.border}`}>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className={`
                  flex-1 px-4 py-3 rounded-lg border ${theme.border}
                  ${theme.inputBg} ${theme.text} placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-offset-0 
                  ${isDark ? 'focus:ring-white' : 'focus:ring-black'}
                  transition-all duration-200
                `}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className={`
                  px-6 py-3 rounded-lg ${theme.buttonBg} ${theme.buttonText}
                  ${theme.buttonHover} disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200 font-medium text-sm
                  flex items-center gap-2
                `}
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}