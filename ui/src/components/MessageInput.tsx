import React, { useState, useRef, useEffect, useCallback } from "react";

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface MessageInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  injectedText?: string;
  onClearInjectedText?: () => void;
  /** If set, persist draft message to localStorage under this key */
  persistKey?: string;
  /** On mobile/compact mode, whether input is visible */
  mobileVisible?: boolean;
  /** Called when input loses focus on mobile/compact mode (to hide it) */
  onMobileBlur?: () => void;
  /** Whether the agent is currently working */
  agentWorking?: boolean;
  /** Callback to cancel the current agent work */
  onCancel?: () => Promise<void>;
  /** Enter key behavior setting */
  enterBehavior?: "send" | "stop_and_send";
  /** Compact mode (multi-pane layout) */
  compact?: boolean;
}

const PERSIST_KEY_PREFIX = "shelley_draft_";

function MessageInput({
  onSend,
  disabled = false,
  autoFocus = false,
  onFocus,
  injectedText,
  onClearInjectedText,
  persistKey,
  mobileVisible = true,
  onMobileBlur,
  agentWorking = false,
  onCancel,
  enterBehavior = "send",
  compact = false,
}: MessageInputProps) {
  const [message, setMessage] = useState(() => {
    // Load persisted draft if persistKey is set
    if (persistKey) {
      return localStorage.getItem(PERSIST_KEY_PREFIX + persistKey) || "";
    }
    return "";
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragCounter, setDragCounter] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Track the base text (before speech recognition started) and finalized speech text
  const baseTextRef = useRef<string>("");
  const finalizedTextRef = useRef<string>("");

  // Check if speech recognition is available
  const speechRecognitionAvailable =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!speechRecognitionAvailable) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    // Capture current message as base text
    setMessage((current) => {
      baseTextRef.current = current;
      finalizedTextRef.current = "";
      return current;
    });

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Accumulate finalized text
      if (finalTranscript) {
        finalizedTextRef.current += finalTranscript;
      }

      // Build the full message: base + finalized + interim
      const base = baseTextRef.current;
      const needsSpace = base.length > 0 && !/\s$/.test(base);
      const spacer = needsSpace ? " " : "";
      const fullText = base + spacer + finalizedTextRef.current + interimTranscript;

      setMessage(fullText);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      stopListening();
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [speechRecognitionAvailable, stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Track Ctrl/Cmd key state for icon display
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setCtrlPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setCtrlPressed(false);
      }
    };
    const handleBlur = () => setCtrlPressed(false);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const uploadFile = async (file: File, insertPosition: number) => {
    const textBefore = message.substring(0, insertPosition);
    const textAfter = message.substring(insertPosition);

    // Add a loading indicator
    const loadingText = `[uploading ${file.name}...]`;
    setMessage(`${textBefore}${loadingText}${textAfter}`);
    setUploadsInProgress((prev) => prev + 1);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "X-Shelley-Request": "1" },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Replace the loading placeholder with the actual file path
      setMessage((currentMessage) => currentMessage.replace(loadingText, `[${data.path}]`));
    } catch (error) {
      console.error("Failed to upload file:", error);
      // Replace loading indicator with error message
      const errorText = `[upload failed: ${error instanceof Error ? error.message : "unknown error"}]`;
      setMessage((currentMessage) => currentMessage.replace(loadingText, errorText));
    } finally {
      setUploadsInProgress((prev) => prev - 1);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    // Check clipboard items (works on both desktop and mobile)
    // Mobile browsers often don't populate clipboardData.files, but items works
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            const cursorPos = textareaRef.current?.selectionStart ?? message.length;
            await uploadFile(file, cursorPos);
            return;
          }
        }
      }
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragCounter((prev) => prev + 1);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragCounter((prev) => prev - 1);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const insertPosition = textareaRef.current?.selectionStart ?? message.length;
      await uploadFile(file, insertPosition);
      if (i < files.length - 1) {
        setMessage((prev) => prev + " ");
      }
    }

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragCounter(0);

    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      // Process all dropped files
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        const file = event.dataTransfer.files[i];
        const insertPosition =
          i === 0 ? (textareaRef.current?.selectionStart ?? message.length) : message.length;
        await uploadFile(file, insertPosition);
        // Add a space between files
        if (i < event.dataTransfer.files.length - 1) {
          setMessage((prev) => prev + " ");
        }
      }
    }
  };

  // Auto-insert injected text (diff comments) directly into the textarea
  useEffect(() => {
    if (injectedText) {
      setMessage((prev) => {
        const needsNewline = prev.length > 0 && !prev.endsWith("\n");
        return prev + (needsNewline ? "\n\n" : "") + injectedText;
      });
      onClearInjectedText?.();
      // Focus the textarea after inserting
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [injectedText, onClearInjectedText]);

  const handleSubmit = async (e: React.FormEvent, invertBehavior = false) => {
    e.preventDefault();
    // Determine effective behavior (Ctrl+Enter inverts the setting)
    const effectiveBehavior = invertBehavior
      ? (enterBehavior === "send" ? "stop_and_send" : "send")
      : enterBehavior;
    
    // In stop_and_send mode, allow submit even while agent is working
    const canSubmitNow = message.trim() && !submitting && uploadsInProgress === 0 &&
      (!disabled || (agentWorking && effectiveBehavior === "stop_and_send"));
    
    if (!canSubmitNow) return;
    
    // Stop listening if we were recording
    if (isListening) {
      stopListening();
    }

    const messageToSend = message;
    setSubmitting(true);
    try {
      // If agent is working and effective behavior is stop_and_send, cancel first
      if (agentWorking && effectiveBehavior === "stop_and_send" && onCancel) {
        await onCancel();
      }
      await onSend(messageToSend);
      // Only clear on success
      setMessage("");
      // Clear persisted draft on successful send
      if (persistKey) {
        localStorage.removeItem(PERSIST_KEY_PREFIX + persistKey);
      }
    } catch {
      // Keep the message on error so user can retry
    } finally {
      setSubmitting(false);
      // Always keep focus on textarea after React re-renders
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't submit while IME is composing (e.g., converting Japanese hiragana to kanji)
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Ctrl+Enter inverts the behavior setting
      handleSubmit(e, e.ctrlKey || e.metaKey);
    }
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 200; // Maximum height in pixels
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  // Persist draft to localStorage when persistKey is set
  useEffect(() => {
    if (persistKey) {
      if (message) {
        localStorage.setItem(PERSIST_KEY_PREFIX + persistKey, message);
      } else {
        localStorage.removeItem(PERSIST_KEY_PREFIX + persistKey);
      }
    }
  }, [message, persistKey]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      // Use setTimeout to ensure the component is fully rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [autoFocus]);

  const isDisabled = disabled || uploadsInProgress > 0;
  // Determine effective behavior based on Ctrl key state
  const effectiveBehavior = ctrlPressed
    ? (enterBehavior === "send" ? "stop_and_send" : "send")
    : enterBehavior;
  
  // In stop_and_send mode, allow submit even while agent is working
  const canSubmit = message.trim() && !submitting && uploadsInProgress === 0 && 
    (!disabled || (agentWorking && effectiveBehavior === "stop_and_send"));

  const isDraggingOver = dragCounter > 0;
  // Note: injectedText is auto-inserted via useEffect, no manual UI needed

  // Check if we're on mobile
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  
  // In compact mode or on mobile, hide if not visible (unless there's draft text)
  if ((isMobile || compact) && !mobileVisible && !message.trim()) {
    return null;
  }

  return (
    <div
      className={`message-input-container ${isDraggingOver ? "drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">Drop files here</div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="message-input-form">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => {
            // Scroll to bottom after keyboard animation settles
            if (onFocus) {
              requestAnimationFrame(() => requestAnimationFrame(onFocus));
            }
          }}
          onBlur={() => {
            // On mobile, hide input when focus is lost (if empty)
            if (onMobileBlur && !message.trim()) {
              // Delay to allow button clicks to register
              setTimeout(() => {
                if (!textareaRef.current?.matches(':focus')) {
                  onMobileBlur();
                }
              }, 100);
            }
          }}
          className="message-textarea"
          disabled={isDisabled}
          rows={1}
          aria-label="Message input"
          data-testid="message-input"
          autoFocus={autoFocus}
          placeholder={(isMobile || compact) ? "" : "Message, paste image, or attach file..."}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          className="message-attach-btn"
          aria-label="Attach file"
          data-testid="attach-button"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
        </button>
        {speechRecognitionAvailable && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={isDisabled}
            className={`message-voice-btn ${isListening ? "listening" : ""}`}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            data-testid="voice-button"
          >
            {isListening ? (
              <svg fill="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="6" />
              </svg>
            ) : (
              <svg fill="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="message-send-btn"
          aria-label="Send message"
          data-testid="send-button"
          onMouseDown={(e) => e.preventDefault()} // Prevent focus from moving to button
        >
          {submitting ? (
            <div className="flex items-center justify-center">
              <div className="spinner spinner-small" style={{ borderTopColor: "white" }}></div>
            </div>
          ) : agentWorking && effectiveBehavior === "stop_and_send" ? (
            // Double chevron up icon for stop & send mode (no rotation)
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" strokeWidth="2.5" style={{ transform: 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 18.75 7.5-7.5 7.5 7.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 7.5-7.5 7.5 7.5" />
            </svg>
          ) : (
            // Normal arrow icon
            <svg fill="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}

export default MessageInput;
