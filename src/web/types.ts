export type Session = {
  id: string;
  title?: string;
  createdAt: string;
  turns: number;
};

export type Message = {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  isTemp?: boolean;
  error?: boolean;
};

export type ApprovalRequest = {
  authId: string;
  toolName: string;
  args: any;
  pattern?: string;
};

export type StreamingToolState = {
  id?: string;
  name: string;
  args: any;
  result?: string;
  error?: boolean;
};

export type SystemInfo = {
  cwd?: string;
  git?: string;
};
