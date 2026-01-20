import { useRef, useEffect } from "react";
import MessageInput from "./MessageInput";

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string) => Promise<void>;
  sending: boolean;
  agentWorking: boolean;
  onCancel?: () => Promise<void>;
  conversationTitle?: string;
  enterBehavior?: "send" | "stop_and_send";
  persistKey?: string;
}

export function InputModal({
  isOpen,
  onClose,
  onSend,
  sending,
  agentWorking,
  onCancel,
  conversationTitle,
  enterBehavior,
  persistKey,
}: InputModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  const handleSend = async (message: string) => {
    onClose();  // Close immediately when sending
    await onSend(message);
  };

  return (
    <div
      ref={backdropRef}
      className="input-modal-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="input-modal">
        {conversationTitle && (
          <div className="input-modal-title">{conversationTitle}</div>
        )}
        <MessageInput
          onSend={handleSend}
          disabled={sending}
          agentWorking={agentWorking}
          onCancel={onCancel}
          autoFocus={true}
          mobileVisible={true}
          enterBehavior={enterBehavior}
          persistKey={persistKey}
        />
      </div>
    </div>
  );
}
