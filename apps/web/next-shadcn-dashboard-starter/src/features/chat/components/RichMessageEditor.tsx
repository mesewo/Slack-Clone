"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface RichMessageEditorHandle {
  focus: () => void;
  insertText: (text: string) => void;
}

interface RichMessageEditorProps {
  initialValue: string;
  onChange: (markdown: string) => void;
  autoFocus?: boolean;
  showToolbar?: boolean;
  onTyping?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  expanded?: boolean;
  mentionSuggestions?: string[];
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToHtml(text: string) {
  return escapeHtml(text)
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeName === "BR") return "\n";

  const content = Array.from(node.childNodes).map(nodeToMarkdown).join("");
  switch (node.nodeName) {
    case "STRONG":
    case "B":
      return `**${content}**`;
    case "EM":
    case "I":
      return `*${content}*`;
    case "U":
      return `__${content}__`;
    case "S":
    case "DEL":
      return `~~${content}~~`;
    case "CODE":
      return `\`${content}\``;
    case "BLOCKQUOTE":
      return content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "PRE":
      return `\`${content}\``;
    case "DIV":
    case "P":
      return `${content}\n`;
    default:
      return content;
  }
}

export const RichMessageEditor = forwardRef<
  RichMessageEditorHandle,
  RichMessageEditorProps
>(function RichMessageEditor(
  {
    initialValue,
    onChange,
    autoFocus = false,
    showToolbar = true,
    onTyping,
    placeholder = "Write a message",
    ariaLabel = "Message",
    expanded = false,
    mentionSuggestions = [],
  },
  forwardedRef,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const renderedValueRef = useRef<string | null>(null);
  const mentionMatch = initialValue.match(/(^|\s)@([\w-]*)$/);
  const mentionQuery = mentionMatch?.[2].toLowerCase() ?? "";
  const visibleMentions = mentionMatch
    ? mentionSuggestions.filter((name) => name.toLowerCase().startsWith(mentionQuery))
    : [];

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || renderedValueRef.current === initialValue) return;
    editor.innerHTML = markdownToHtml(initialValue);
    renderedValueRef.current = initialValue;
  }, [initialValue]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  const syncDraft = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const markdown = nodeToMarkdown(editor).replace(/\n+$/, "");
    renderedValueRef.current = markdown;
    onChange(markdown);
    onTyping?.();
  };

  const applyFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncDraft();
  };

  const insertText = (text: string) => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, text);
    syncDraft();
  };

  const insertMention = (mention: string) => {
    const editor = editorRef.current;
    if (!editor || !mentionMatch) return;
    editor.focus();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      range.deleteContents();
      range.insertNode(document.createTextNode(`@${mention} `));
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      document.execCommand("insertText", false, `@${mention} `);
    }
    syncDraft();
  };

  useImperativeHandle(forwardedRef, () => ({
    focus: () => editorRef.current?.focus(),
    insertText,
  }));

  const formatButton = (label: string, path: string, command: string, value?: string) => (
    <button
      key={label}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => command === "createLink"
        ? applyFormat(command, window.prompt("Enter link URL") || undefined)
        : applyFormat(command, value)}
      className="text-foreground/70 hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
      aria-label={label}
      title={label}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );

  const separator = <span className="mx-1 h-4 border-l border-border" aria-hidden="true" />;

  return (
    <>
      {showToolbar && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1 p-0 sm:mb-2" role="toolbar" aria-label="Text formatting">
          {formatButton("Bold", "M4 2.75A.75.75 0 0 1 4.75 2h6.343a3.91 3.91 0 0 1 3.88 3.449A2 2 0 0 1 15 5.84l.001.067a3.9 3.9 0 0 1-1.551 3.118A4.627 4.627 0 0 1 11.875 18H4.75a.75.75 0 0 1-.75-.75V9.5a.8.8 0 0 1 .032-.218A.8.8 0 0 1 4 9.065zm2.5 5.565h3.593a2.157 2.157 0 1 0 0-4.315H6.5zm4.25 1.935H6.5v5.5h4.25a2.75 2.75 0 1 0 0-5.5", "bold")}
          {formatButton("Italic", "M7 2.75A.75.75 0 0 1 7.75 2h7.5a.75.75 0 0 1 0 1.5H12.3l-2.6 13h2.55a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5H7.7l2.6-13H7.75A.75.75 0 0 1 7 2.75", "italic")}
          {formatButton("Underline", "M17.25 17.12a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5zM14.5 1.63a.75.75 0 0 1 .75.75v8a5.25 5.25 0 1 1-10.5 0v-8a.75.75 0 0 1 1.5 0v8a3.75 3.75 0 0 0 7.5 0v-8a.75.75 0 0 1 .75-.75", "underline")}
          {formatButton("Strikethrough", "M11.721 3.84c-.91-.334-2.028-.36-3.035-.114-1.51.407-2.379 1.861-2.164 3.15C6.718 8.051 7.939 9.5 11.5 9.5l.027.001h5.723a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5h3.66c-.76-.649-1.216-1.468-1.368-2.377-.347-2.084 1.033-4.253 3.265-4.848l.007-.002.007-.002c1.252-.307 2.68-.292 3.915.16 1.252.457 2.337 1.381 2.738 2.874a.75.75 0 0 1-1.448.39c-.25-.925-.91-1.528-1.805-1.856m2.968 9.114a.75.75 0 1 0-1.378.59c.273.64.186 1.205-.13 1.674-.333.492-.958.925-1.82 1.137-.989.243-1.991.165-3.029-.124-.93-.26-1.613-.935-1.858-1.845a.75.75 0 0 0-1.448.39c.388 1.441 1.483 2.503 2.903 2.9 1.213.338 2.486.456 3.79.135 1.14-.28 2.12-.889 2.704-1.753.6-.888.743-1.992.266-3.104", "strikeThrough")}
          {separator}
          {formatButton("Link", "M12.306 3.756a2.75 2.75 0 0 1 3.889 0l.05.05a2.75 2.75 0 0 1 0 3.889l-3.18 3.18a2.75 2.75 0 0 1-3.98-.095l-.03-.034a.75.75 0 0 0-1.11 1.009l.03.034a4.25 4.25 0 0 0 6.15.146l3.18-3.18a4.25 4.25 0 0 0 0-6.01l-.05-.05a4.25 4.25 0 0 0-6.01 0L9.47 4.47a.75.75 0 1 0 1.06 1.06zm-4.611 12.49a2.75 2.75 0 0 1-3.89 0l-.05-.051a2.75 2.75 0 0 1 0-3.89l3.18-3.179a2.75 2.75 0 0 1 3.98.095l.03.034a.75.75 0 1 0 1.11-1.01l-.03-.033a4.25 4.25 0 0 0-6.15-.146l-3.18 3.18a4.25 4.25 0 0 0 0 6.01l.05.05a4.25 4.25 0 0 0 6.01 0l1.775-1.775a.75.75 0 0 0-1.06-1.06z", "createLink")}
          {formatButton("Numbered list", "M3.792 2.094A.5.5 0 0 1 4 2.5V6h1a.5.5 0 1 1 0 1H2a.5.5 0 1 1 0-1h1V3.194l-.842.28a.5.5 0 0 1-.316-.948l1.5-.5a.5.5 0 0 1 .45.068M7.75 3.5a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5zM7 10.75a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75m0 6.5a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75m-4.293-3.36a1 1 0 0 1 .793-.39c.49 0 .75.38.75.75 0 .064-.033.194-.173.409a5 5 0 0 1-.594.711c-.256.267-.552.548-.87.848l-.088.084a42 42 0 0 0-.879.845A.5.5 0 0 0 2 18h3a.5.5 0 0 0 0-1H3.242l.058-.055c.316-.298.629-.595.904-.882a6 6 0 0 0 .711-.859c.18-.277.335-.604.335-.954 0-.787-.582-1.75-1.75-1.75a2 2 0 0 0-1.81 1.147.5.5 0 1 0 .905.427 1 1 0 0 1 .112-.184", "insertOrderedList")}
          {formatButton("Bulleted list", "M4 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0m3 0a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10A.75.75 0 0 1 7 3m.75 6.25a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5zm0 7a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5zM3 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2m0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2", "insertUnorderedList")}
          {separator}
          {formatButton("Blockquote", "M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0zM6.75 3a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5zM6 10.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75m.75 5.25a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5z", "formatBlock", "blockquote")}
          {formatButton("Code", "M12.058 3.212c.396.12.62.54.5.936L8.87 16.29a.75.75 0 1 1-1.435-.436l3.686-12.143a.75.75 0 0 1 .936-.5M5.472 6.24a.75.75 0 0 1 .005 1.06l-2.67 2.693 2.67 2.691a.75.75 0 1 1-1.065 1.057l-3.194-3.22a.75.75 0 0 1 0-1.056l3.194-3.22a.75.75 0 0 1 1.06-.005m9.044 1.06a.75.75 0 1 1 1.065-1.056l3.194 3.221a.75.75 0 0 1 0 1.057l-3.194 3.219a.75.75 0 0 1-1.065-1.057l2.67-2.69z", "formatBlock", "code")}
          {formatButton("Code block", "M9.212 2.737a.75.75 0 1 0-1.424-.474l-2.5 7.5a.75.75 0 0 0 1.424.474zm6.038.265a.75.75 0 0 0 0 1.5h2a.25.25 0 0 1 .25.25v11.5a.25.25 0 0 1-.25.25h-13a.25.25 0 0 1-.25-.25v-3.5a.75.75 0 0 0-1.5 0v3.5c0 .966.784 1.75 1.75 1.75h13a1.75 1.75 0 0 0 1.75-1.75v-11.5a1.75 1.75 0 0 0-1.75-1.75zm-3.69.5a.75.75 0 1 0-1.12.996l1.556 1.754-1.556 1.75a.75.75 0 1 0 1.12.997l2-2.249a.75.75 0 0 0 0-.996zM3.999 9.061a.75.75 0 0 1-1.058-.062l-2-2.249a.75.75 0 0 1 0-.996l2-2.252a.75.75 0 1 1 1.12.996L2.504 6.252l1.557 1.75a.75.75 0 0 1-.062 1.059", "formatBlock", "pre")}
        </div>
      )}
      <div className="relative">
        <div
          ref={editorRef}
          id="messenger-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          tabIndex={0}
          onInput={syncDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.closest("form")?.requestSubmit();
            }
          }}
          data-placeholder={placeholder}
          className={`text-foreground empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] min-h-[2.5rem] w-full ${expanded ? "max-h-[50vh]" : "max-h-[20rem]"} overflow-y-auto border-none bg-transparent text-sm outline-none sm:min-h-[3rem]`}
          aria-label={ariaLabel}
        />
        {visibleMentions.length > 0 && (
          <div className="border-border/70 bg-popover absolute right-0 bottom-full z-30 mb-2 w-56 rounded-xl border p-1 shadow-xl">
            <p className="text-muted-foreground px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
              Mention someone
            </p>
            {visibleMentions.slice(0, 6).map((mention) => (
              <button
                key={mention}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(mention)}
                className="hover:bg-accent flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs"
              >
                <span className="text-primary mr-1">@</span>{mention}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
});
