import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = "http://localhost:5000";

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("nebula-dark-mode") === "true";
  });
  const [emails, setEmails] = useState([]);
  const [currentFolder, setCurrentFolder] = useState("INBOX");
  const [currentQuery, setCurrentQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState(null);
  const selectedEmailRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [openingEmail, setOpeningEmail] = useState(false);
  const [error, setError] = useState("");

  const [showCompose, setShowCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState("");

  const [replyThreadId, setReplyThreadId] = useState("");
  const [replyMessageId, setReplyMessageId] = useState("");

  const [aiMessage, setAiMessage] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem("nebula-dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(
      () => fetchEmails(currentFolder, currentQuery, true),
      10000
    );
    return () => clearInterval(interval);
  }, [authenticated, currentFolder, currentQuery]);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API}/auth/status`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.authenticated) {
        setAuthenticated(true);
        await fetchEmails("INBOX", "");
      } else {
        setAuthenticated(false);
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to connect to server");
      setLoading(false);
    }
  };

  const fetchEmails = async (
    folder = currentFolder,
    query = currentQuery,
    silent = false
  ) => {
    try {
      if (!silent) setLoading(true);
      setError("");

      let url = `${API}/api/emails?label=${encodeURIComponent(folder)}`;
      if (query) url += `&query=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch emails");
      }

      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch emails error:", err);
      if (!silent) {
        setError(err.message || "Failed to load emails");
        setEmails([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Always fetch the complete Gmail message before storing it as current.
  const openEmail = async (email) => {
    try {
      setOpeningEmail(true);
      setError("");

      // Keep the list email immediately available to the AI.
      selectedEmailRef.current = email;
      setSelectedEmail(email);

      const response = await fetch(
        `${API}/api/emails/${encodeURIComponent(email.id)}`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to open email");
      }

      const fullEmail = {
        ...email,
        ...data,
        body: cleanEmailBody(data.body),
      };

      selectedEmailRef.current = fullEmail;
      setSelectedEmail(fullEmail);
    } catch (err) {
      console.error("Open email error:", err);
      // Do not lose the selected email if body loading fails.
      selectedEmailRef.current = email;
      setSelectedEmail(email);
      setError(`Full email could not be loaded: ${err.message}`);
    } finally {
      setOpeningEmail(false);
    }
  };

  const closeEmail = () => {
    selectedEmailRef.current = null;
    setSelectedEmail(null);
  };

  const loginWithGoogle = () => {
    window.location.href = `${API}/auth/google`;
  };

  const changeFolder = async (folder) => {
    selectedEmailRef.current = null;
    setCurrentFolder(folder);
    setCurrentQuery("");
    setSelectedEmail(null);
    setError("");
    setAiMessage("");
    await fetchEmails(folder, "");
  };

  const openCompose = () => {
    setTo("");
    setSubject("");
    setBody("");
    setSendMessage("");
    setReplyThreadId("");
    setReplyMessageId("");
    setShowCompose(true);
  };

  const closeCompose = () => {
    if (sending) return;
    setShowCompose(false);
    setTo("");
    setSubject("");
    setBody("");
    setSendMessage("");
    setReplyThreadId("");
    setReplyMessageId("");
  };

  const sendEmail = async () => {
    if (!to.trim()) return setSendMessage("❌ Please enter recipient email.");
    if (!subject.trim()) return setSendMessage("❌ Please enter a subject.");
    if (!body.trim()) return setSendMessage("❌ Please write a message.");

    try {
      setSending(true);
      setSendMessage("");

      const response = await fetch(`${API}/api/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          threadId: replyThreadId || undefined,
          inReplyTo: replyMessageId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send email");
      }

      setSendMessage("✅ Email sent successfully!");

      setTimeout(async () => {
        setShowCompose(false);
        setTo("");
        setSubject("");
        setBody("");
        setReplyThreadId("");
        setReplyMessageId("");
        setCurrentFolder("SENT");
        setCurrentQuery("");
        await fetchEmails("SENT", "");
      }, 700);
    } catch (err) {
      console.error("Send error:", err);
      setSendMessage(`❌ ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const cleanEmailBody = (value = "") => {
    if (typeof value !== "string") return "";

    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const getSenderName = (from = "") => {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from.split("@")[0].trim() || "Unknown";
  };

  const getEmailAddress = (value = "") => {
    const match = value.match(/<([^>]+)>/);
    return match ? match[1] : value.trim();
  };

  const handleAIInput = async (customMessage = null) => {
    const userMessage =
      customMessage !== null ? customMessage.trim() : aiInput.trim();

    if (!userMessage || aiLoading) return;
    if (customMessage === null) setAiInput("");

    setAiLoading(true);
    setAiMessage("✨ Nebula AI is thinking...");

    const currentEmail = selectedEmailRef.current;

    try {
      const response = await fetch(`${API}/api/ai`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: {
            currentFolder,
            emails: emails.map((email) => ({
              id: email.id,
              from: email.from,
              to: email.to,
              subject: email.subject,
              date: email.date,
              unread: email.unread,
            })),
            // Use the ref so "reply to this" always gets the
            // email currently open, even during a React state update.
            selectedEmail: currentEmail
              ? {
                  id: currentEmail.id,
                  threadId: currentEmail.threadId || "",
                  messageId: currentEmail.messageId || "",
                  from: currentEmail.from || "",
                  to: currentEmail.to || "",
                  subject: currentEmail.subject || "",
                  date: currentEmail.date || "",
                  snippet: currentEmail.snippet || "",
                  body: currentEmail.body || "",
                }
              : null,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      if (data.action === "composeEmail") {
        const email = data.data || {};
        setShowCompose(true);
        setSendMessage("");
        setTo(email.to || "");
        setSubject(email.subject || "");
        setBody(email.body || "");
        setReplyThreadId("");
        setReplyMessageId("");
        setAiMessage("✨ Email prepared! Please review it before sending.");
        return;
      }

      if (data.action === "filterEmails") {
        const filtered = data.data?.emails || [];
        setEmails(filtered);
        setCurrentQuery(data.data?.query || "");
        selectedEmailRef.current = null;
        setSelectedEmail(null);
        setAiMessage(
          data.message || `🔎 Found ${filtered.length} matching emails.`
        );
        return;
      }

      if (data.action === "openEmail") {
        const email = data.data?.email;
        if (!email) {
          setAiMessage("❌ Could not find the email.");
          return;
        }

        const openedEmail = {
          ...email,
          body: cleanEmailBody(email.body),
        };

        selectedEmailRef.current = openedEmail;
        setSelectedEmail(openedEmail);
        setAiMessage("📖 Email opened successfully.");
        return;
      }

      if (data.action === "replyEmail") {
        const reply = data.data || {};
        const latestCurrent = selectedEmailRef.current;

        // Backend is authoritative, but use the currently opened
        // email as a safe fallback.
        const replyTo =
          reply.to || getEmailAddress(latestCurrent?.from || "");
        const replySubject =
          reply.subject ||
          (latestCurrent?.subject
            ? /^re:/i.test(latestCurrent.subject)
              ? latestCurrent.subject
              : `Re: ${latestCurrent.subject}`
            : "");

        setShowCompose(true);
        setSendMessage("");
        setTo(replyTo);
        setSubject(replySubject);
        setBody(reply.body || "");
        setReplyThreadId(
          reply.threadId || latestCurrent?.threadId || ""
        );
        setReplyMessageId(
          reply.messageId || latestCurrent?.messageId || ""
        );

        setAiMessage(
          "↩️ Reply prepared! Check the recipient, message and subject, then click Send."
        );
        return;
      }

      setAiMessage(
        data.message || "I'm ready to help with your emails."
      );
    } catch (err) {
      console.error("AI error:", err);
      setAiMessage(`❌ AI Error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const replyWithAI = () => {
    if (!selectedEmailRef.current) {
      setAiMessage("Please open the email you want to reply to first.");
      return;
    }

    handleAIInput(
      "Reply to this email with a polite and natural response. Keep it concise."
    );
  };

  const handleAISuggestion = (message) => {
    setAiInput(message);
    handleAIInput(message);
  };

  if (!authenticated && !loading) {
    return (
      <div className={`login-page ${darkMode ? "dark-login" : ""}`}>
        <button
          className="login-theme-button"
          onClick={() => setDarkMode((prev) => !prev)}
          title={darkMode ? "Light mode" : "Dark mode"}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>

        <div className="login-card">
          <div className="logo">✉️</div>
          <h1>Nebula Mail</h1>
          <p>
            Your intelligent
            <br />
            AI-powered email
            <br />
            assistant.
          </p>
          <button className="google-button" onClick={loginWithGoogle}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-page">
        <h2>Loading Nebula Mail...</h2>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? "dark-mode" : ""}`}>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✉️</span>
          <span>Nebula Mail</span>
        </div>

        <button className="compose-button" onClick={openCompose}>
          ＋ Compose
        </button>

        <nav className="navigation">
          <button
            className={`nav-item ${currentFolder === "INBOX" ? "active" : ""}`}
            onClick={() => changeFolder("INBOX")}
          >
            📥 <span>Inbox</span>
            {currentFolder === "INBOX" && (
              <span className="count">{emails.length}</span>
            )}
          </button>

          <button className="nav-item">
            ⭐ <span>Starred</span>
          </button>

          <button
            className={`nav-item ${currentFolder === "SENT" ? "active" : ""}`}
            onClick={() => changeFolder("SENT")}
          >
            📤 <span>Sent</span>
            {currentFolder === "SENT" && (
              <span className="count">{emails.length}</span>
            )}
          </button>

          <button className="nav-item">
            🗑️ <span>Trash</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="connected">
            <span>🟢</span> Gmail Connected
          </div>
        </div>
      </aside>

      {/* MAIL LIST */}
      <main className="main">
        <header className="header">
          <div>
            <h2>{currentFolder === "SENT" ? "Sent" : "Inbox"}</h2>
            <p>{emails.length} conversations</p>
          </div>

          <div className="header-actions">
            <button
              className="theme-button"
              onClick={() => setDarkMode((prev) => !prev)}
              title={darkMode ? "Light mode" : "Dark mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              className="refresh-button"
              onClick={() => fetchEmails(currentFolder, currentQuery)}
            >
              ↻ Refresh
            </button>
            <div className="avatar">V</div>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <div className="email-list">
          {emails.length === 0 ? (
            <div className="empty">
              <div>📭</div>
              <h3>
                {currentFolder === "SENT"
                  ? "No sent emails"
                  : "Your inbox is empty"}
              </h3>
              <p>No emails found.</p>
            </div>
          ) : (
            emails.map((email) => (
              <div
                key={email.id}
                className={`email-row ${email.unread ? "unread" : ""}`}
                onClick={() => openEmail(email)}
              >
                <div className="sender">
                  {currentFolder === "SENT"
                    ? getSenderName(email.to)
                    : getSenderName(email.from)}
                </div>

                <div className="email-content">
                  <span className="subject">
                    {email.subject || "(No Subject)"}
                  </span>
                  <span className="snippet"> — {email.snippet}</span>
                </div>

                <div className="email-date">
                  {formatDate(email.date)}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* AI PANEL */}
      <aside className="ai-panel">
        <div className="ai-header">
          <div>
            <h3>✨ AI Assistant</h3>
            <p>Control your inbox with AI</p>
          </div>
        </div>

        <div className="ai-body">
          <div className="ai-welcome">
            <div className="ai-icon">✨</div>
            <h3>Hi! I'm Nebula AI</h3>
            <p>Tell me what you want to do with your emails.</p>
          </div>

          <div className="suggestions">
            <button onClick={() => handleAISuggestion("Show only unread emails")}>
              Show unread emails
            </button>
            <button onClick={() => handleAISuggestion("Find emails from today")}>
              Find emails from today
            </button>
            <button
              onClick={() =>
                handleAISuggestion("Show emails from this week")
              }
            >
              Show emails from this week
            </button>
            <button onClick={() => handleAISuggestion("Open my latest email")}>
              Open my latest email
            </button>
          </div>

          {aiMessage && <div className="ai-message">{aiMessage}</div>}
        </div>

        <div className="ai-input">
          <input
            type="text"
            placeholder="Ask Nebula AI..."
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !aiLoading) handleAIInput();
            }}
            disabled={aiLoading}
          />
          <button
            onClick={() => handleAIInput()}
            disabled={aiLoading || !aiInput.trim()}
          >
            {aiLoading ? "..." : "➤"}
          </button>
        </div>
      </aside>

      {/* EMAIL DETAIL */}
      {selectedEmail && (
        <div className="email-modal" onClick={closeEmail}>
          <div className="email-detail" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeEmail}>
              ✕
            </button>

            {openingEmail && (
              <div style={{ textAlign: "center", padding: "8px" }}>
                Loading full email...
              </div>
            )}

            <h2>{selectedEmail.subject || "(No Subject)"}</h2>

            <div className="detail-info">
              <strong>
                {currentFolder === "SENT" ? "To: " : "From: "}
                {getSenderName(
                  currentFolder === "SENT"
                    ? selectedEmail.to
                    : selectedEmail.from
                )}
              </strong>
              <span>
                {getEmailAddress(
                  currentFolder === "SENT"
                    ? selectedEmail.to
                    : selectedEmail.from
                )}
              </span>
              <span>{formatDate(selectedEmail.date)}</span>
            </div>

            <hr />

            {/* AI REPLY BUTTON */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "18px",
              }}
            >
              <button
                type="button"
                className="reply-ai-button"
                onClick={replyWithAI}
                disabled={aiLoading || openingEmail}
                style={{
                  border: "none",
                  borderRadius: "9px",
                  padding: "10px 16px",
                  background: "#111827",
                  color: "#fff",
                  cursor:
                    aiLoading || openingEmail
                      ? "not-allowed"
                      : "pointer",
                  opacity: aiLoading || openingEmail ? 0.6 : 1,
                  fontWeight: 600,
                }}
              >
                ↩ Reply with AI
              </button>
            </div>

            <div className="email-body">
              {selectedEmail.body ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    fontFamily: "inherit",
                    lineHeight: "1.6",
                    margin: 0,
                    fontSize: "15px",
                  }}
                >
                  {cleanEmailBody(selectedEmail.body)}
                </pre>
              ) : openingEmail ? (
                <p>Loading email content...</p>
              ) : (
                <p className="email-snippet">
                  {selectedEmail.snippet || "No email body available."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* COMPOSE / REPLY */}
      {showCompose && (
        <div className="compose-overlay" onClick={closeCompose}>
          <div className="compose-window" onClick={(e) => e.stopPropagation()}>
            <div className="compose-header">
              <h3>{replyThreadId ? "Reply" : "New Message"}</h3>
              <button onClick={closeCompose}>✕</button>
            </div>

            <input
              type="email"
              placeholder="Recipients"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />

            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />

            <textarea
              placeholder="Write your message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            {sendMessage && (
              <div className="send-message">{sendMessage}</div>
            )}

            <div className="compose-footer">
              <button
                className="send-button"
                onClick={sendEmail}
                disabled={sending}
              >
                {sending ? "Sending..." : "Send ✈️"}
              </button>
              <button
                className="discard-button"
                onClick={closeCompose}
                disabled={sending}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
export default App;
