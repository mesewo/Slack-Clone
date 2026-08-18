export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type Message = {
  id: string;
  sender: "user" | "contact"; // 'user' = you; 'contact' = any other channel member
  author: string;
  text: string;
  timestamp: string;
  attachments?: Attachment[];
};

export type ConversationStatus = "online" | "offline";

// A "Conversation" here is a channel, not a 1:1 contact - kept the name and
// field shape so conversation-list.tsx / message-bubble.tsx / message-composer.tsx
// don't need to change. quickReplies and autoReplies are always [] now: there's
// no more canned-bot-reply script, real replies come from other users over
// the WebSocket.
export type Conversation = {
  id: string;
  name: string;
  title: string;
  status: ConversationStatus;
  unread: number;
  initials: string;
  messages: Message[];
  quickReplies: string[];
  autoReplies: string[];
};
