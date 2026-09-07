const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

const PORT = 5000;
const FRONTEND_URL = "http://localhost:5173";

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "nebula-secret",

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: false,
      maxAge:
        24 * 60 * 60 * 1000,
    },
  })
);

// =====================================================
// GOOGLE OAUTH CLIENT
// =====================================================

const createOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

// =====================================================
// GMAIL CLIENT
// =====================================================

const getGmailClient = (req) => {
  if (!req.session.tokens) {
    throw new Error("Not authenticated");
  }

  const oauth2Client =
    createOAuthClient();

  oauth2Client.setCredentials(
    req.session.tokens
  );

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
};

// =====================================================
// GOOGLE LOGIN
// =====================================================

app.get(
  "/auth/google",
  (req, res) => {
    try {
      const oauth2Client =
        createOAuthClient();

      const authUrl =
        oauth2Client.generateAuthUrl({
          access_type: "offline",
          prompt: "consent",

          scope: [
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.send",
          ],
        });

      res.redirect(authUrl);

    } catch (error) {
      console.error(
        "Google Login Error:",
        error
      );

      res
        .status(500)
        .send("Google login failed");
    }
  }
);

// =====================================================
// GOOGLE CALLBACK
// =====================================================

app.get(
  "/auth/google/callback",
  async (req, res) => {
    try {
      const { code } = req.query;

      if (!code) {
        return res
          .status(400)
          .send(
            "Authorization code missing"
          );
      }

      const oauth2Client =
        createOAuthClient();

      const { tokens } =
        await oauth2Client.getToken(
          code
        );

      req.session.tokens = tokens;

      res.redirect(
        FRONTEND_URL + "/"
      );

    } catch (error) {
      console.error(
        "OAuth Error:",
        error
      );

      res
        .status(500)
        .send(
          "Google authentication failed"
        );
    }
  }
);

// =====================================================
// AUTH STATUS
// =====================================================

app.get(
  "/auth/status",
  (req, res) => {
    res.json({
      authenticated:
        !!req.session.tokens,
    });
  }
);

// =====================================================
// HEADER HELPER
// =====================================================

const getHeader = (
  headers,
  name
) => {
  const header =
    (headers || []).find(
      (h) =>
        h.name?.toLowerCase() ===
        name.toLowerCase()
    );

  return header?.value || "";
};

// =====================================================
// BASE64 URL DECODE
// =====================================================

const decodeBase64Url = (
  data = ""
) => {
  if (!data) {
    return "";
  }

  try {
    return Buffer.from(
      data
        .replace(/-/g, "+")
        .replace(/_/g, "/"),
      "base64"
    ).toString("utf8");

  } catch {
    return "";
  }
};

// =====================================================
// EXTRACT GMAIL BODY
// =====================================================

const extractGmailBody = (
  payload
) => {
  if (!payload) {
    return "";
  }

  // Plain text body
  if (
    payload.mimeType ===
      "text/plain" &&
    payload.body?.data
  ) {
    return decodeBase64Url(
      payload.body.data
    );
  }

  // Multipart email
  if (
    payload.parts &&
    payload.parts.length
  ) {

    // First search for plain text
    for (
      const part of payload.parts
    ) {

      if (
        part.mimeType ===
          "text/plain" &&
        part.body?.data
      ) {
        return decodeBase64Url(
          part.body.data
        );
      }
    }

    // Recursively search nested parts
    for (
      const part of payload.parts
    ) {

      const nestedBody =
        extractGmailBody(part);

      if (nestedBody) {
        return nestedBody;
      }
    }
  }

  // Fallback
  if (payload.body?.data) {
    return decodeBase64Url(
      payload.body.data
    );
  }

  return "";
};

// =====================================================
// FORMAT GMAIL MESSAGE
// =====================================================

const formatGmailMessage = (
  detail
) => {

  const headers =
    detail.data.payload
      ?.headers || [];

  return {

    id:
      detail.data.id,

    threadId:
      detail.data.threadId,

    from:
      getHeader(
        headers,
        "From"
      ),

    to:
      getHeader(
        headers,
        "To"
      ),

    subject:
      getHeader(
        headers,
        "Subject"
      ),

    date:
      getHeader(
        headers,
        "Date"
      ),

    snippet:
      detail.data.snippet || "",

    unread:
      detail.data.labelIds?.includes(
        "UNREAD"
      ) || false,
  };
};

// =====================================================
// GET EMAIL LIST
// =====================================================

const getGmailEmails = async (
  req,
  options = {}
) => {

  const gmail =
    getGmailClient(req);

  const label =
    options.label || "INBOX";

  const query =
    options.query || "";

  const listParams = {
    userId: "me",
    maxResults: 20,
  };

  if (label) {
    listParams.labelIds = [
      label,
    ];
  }

  if (query.trim()) {
    listParams.q =
      query.trim();
  }

  const response =
    await gmail.users.messages.list(
      listParams
    );

  const messages =
    response.data.messages || [];

  const emails = [];

  for (
    const message of messages
  ) {

    const detail =
      await gmail.users.messages.get({
        userId: "me",

        id: message.id,

        format: "metadata",

        metadataHeaders: [
          "From",
          "To",
          "Subject",
          "Date",
        ],
      });

    emails.push(
      formatGmailMessage(
        detail
      )
    );
  }

  return emails;
};

// =====================================================
// GET SINGLE EMAIL
// FULL EMAIL BODY
// =====================================================

const getSingleGmailEmail =
  async (
    req,
    emailId
  ) => {

    const gmail =
      getGmailClient(req);

    const detail =
      await gmail.users.messages.get({
        userId: "me",

        id: emailId,

        // IMPORTANT
        // Get complete Gmail message
        format: "full",
      });

    const email =
      formatGmailMessage(
        detail
      );

    // Actual email body
    email.body =
      extractGmailBody(
        detail.data.payload
      );

    // Gmail Message-ID
    email.messageId =
      getHeader(
        detail.data.payload
          ?.headers,
        "Message-ID"
      );

    return email;
  };

// =====================================================
// GET LATEST EMAIL
// =====================================================

const getLatestGmailEmail =
  async (
    req,
    label = "INBOX"
  ) => {

    const gmail =
      getGmailClient(req);

    const response =
      await gmail.users.messages.list({
        userId: "me",

        labelIds: [
          label,
        ],

        maxResults: 1,
      });

    const messages =
      response.data.messages || [];

    if (!messages.length) {
      return null;
    }

    return getSingleGmailEmail(
      req,
      messages[0].id
    );
  };

// =====================================================
// GET EMAIL LIST API
// =====================================================

app.get(
  "/api/emails",
  async (req, res) => {

    try {

      if (!req.session.tokens) {
        return res
          .status(401)
          .json({
            error:
              "Not authenticated",
          });
      }

      const label =
        req.query.label ||
        "INBOX";

      const query =
        req.query.query ||
        "";

      const emails =
        await getGmailEmails(
          req,
          {
            label,
            query,
          }
        );

      res.json(emails);

    } catch (error) {

      console.error(
        "Fetch emails error:",
        error.response?.data ||
          error.message
      );

      res
        .status(500)
        .json({
          error:
            "Failed to fetch emails",
        });
    }
  }
);

// =====================================================
// GET ONE EMAIL API
// THIS IS IMPORTANT FOR FULL EMAIL BODY
// =====================================================

app.get(
  "/api/emails/:id",
  async (req, res) => {

    try {

      if (!req.session.tokens) {
        return res
          .status(401)
          .json({
            error:
              "Not authenticated",
          });
      }

      const email =
        await getSingleGmailEmail(
          req,
          req.params.id
        );

      res.json(email);

    } catch (error) {

      console.error(
        "Get single email error:",
        error.response?.data ||
          error.message
      );

      res
        .status(500)
        .json({
          error:
            "Failed to fetch email",
        });
    }
  }
);

// =====================================================
// SEND EMAIL
// =====================================================

app.post(
  "/api/send",
  async (req, res) => {

    try {

      const gmail =
        getGmailClient(req);

      const {
        to,
        subject,
        body,
        threadId,
        inReplyTo,
      } = req.body;

      if (
        !to ||
        !subject ||
        !body
      ) {

        return res
          .status(400)
          .json({
            error:
              "To, subject and body are required",
          });
      }

      const headers = [

        `To: ${to}`,

        `Subject: ${subject}`,

        "Content-Type: text/plain; charset=utf-8",

      ];

      // Reply headers
      if (inReplyTo) {

        headers.push(
          `In-Reply-To: ${inReplyTo}`
        );

        headers.push(
          `References: ${inReplyTo}`
        );
      }

      const message =
        [
          ...headers,
          "",
          body,
        ].join("\r\n");

      const encodedMessage =
        Buffer.from(
          message
        )
          .toString("base64")
          .replace(
            /\+/g,
            "-"
          )
          .replace(
            /\//g,
            "_"
          )
          .replace(
            /=+$/,
            ""
          );

      const requestBody = {
        raw:
          encodedMessage,
      };

      // Keep Gmail reply in same thread
      if (threadId) {
        requestBody.threadId =
          threadId;
      }

      const result =
        await gmail.users.messages.send({
          userId: "me",

          requestBody,
        });

      res.json({

        success: true,

        messageId:
          result.data.id,

      });

    } catch (error) {

      console.error(
        "Send email error:",
        error.response?.data ||
          error.message
      );

      res
        .status(500)
        .json({
          error:
            "Failed to send email",
        });
    }
  }
);

// =====================================================
// BUILD GMAIL SEARCH QUERY
// =====================================================

const buildGmailQuery = (
  filterType,
  value = ""
) => {

  switch (filterType) {

    // -----------------------------
    // UNREAD
    // -----------------------------

    case "unread":

      return "is:unread";


    // -----------------------------
    // READ
    // -----------------------------

    case "read":

      return "is:read";


    // -----------------------------
    // TODAY
    // -----------------------------

    case "today": {

      const today =
        new Date();

      const year =
        today.getFullYear();

      const month =
        String(
          today.getMonth() + 1
        ).padStart(2, "0");

      const day =
        String(
          today.getDate()
        ).padStart(2, "0");

      return (
        `after:${year}/${month}/${day}`
      );
    }


    // -----------------------------
    // THIS WEEK
    // -----------------------------

    case "this_week": {

      const today =
        new Date();

      const day =
        today.getDay();

      const diff =
        day === 0
          ? 6
          : day - 1;

      const monday =
        new Date(today);

      monday.setDate(
        today.getDate() -
          diff
      );

      const year =
        monday.getFullYear();

      const month =
        String(
          monday.getMonth() + 1
        ).padStart(2, "0");

      const date =
        String(
          monday.getDate()
        ).padStart(2, "0");

      return (
        `after:${year}/${month}/${date}`
      );
    }


    // -----------------------------
    // LAST 10 DAYS
    // -----------------------------

    case "last_10_days":

      return "newer_than:10d";


    // -----------------------------
    // SENDER
    // -----------------------------

    case "sender":

      return value
        ? `from:${value}`
        : "";


    // -----------------------------
    // KEYWORD
    // -----------------------------

    case "keyword":

      return value || "";


    default:

      return "";
  }
};

// =====================================================
// GROQ AI
// =====================================================

app.post(
  "/api/ai",
  async (req, res) => {

    try {

      const {
        message,
        context,
      } = req.body;

      if (
        !message ||
        !message.trim()
      ) {

        return res
          .status(400)
          .json({
            error:
              "AI message is required",
          });
      }

      if (
        !process.env.GROQ_API_KEY
      ) {

        return res
          .status(500)
          .json({
            error:
              "GROQ_API_KEY is missing from server .env",
          });
      }

      console.log(
        "🤖 Sending request to Groq..."
      );

      // =================================================
      // AI TOOLS
      // =================================================

      const tools = [

        // ===============================================
        // COMPOSE EMAIL
        // ===============================================

        {
          type: "function",

          function: {

            name:
              "composeEmail",

            description:
              "Prepare an email in the compose window. Never send automatically.",

            parameters: {

              type: "object",

              properties: {

                to: {
                  type: "string",

                  description:
                    "Recipient email address. Never invent it.",
                },

                subject: {
                  type: "string",

                  description:
                    "Email subject.",
                },

                body: {
                  type: "string",

                  description:
                    "Complete email body.",
                },
              },

              required: [
                "to",
                "subject",
                "body",
              ],
            },
          },
        },


        // ===============================================
        // FILTER EMAILS
        // ===============================================

        {
          type: "function",

          function: {

            name:
              "filterEmails",

            description:
              "Search or filter Gmail emails.",

            parameters: {

              type: "object",

              properties: {

                filterType: {

                  type: "string",

                  enum: [
                    "unread",
                    "read",
                    "today",
                    "this_week",
                    "last_10_days",
                    "sender",
                    "keyword",
                  ],
                },

                value: {

                  type: "string",

                  description:
                    "Sender email or keyword.",
                },
              },

              required: [
                "filterType",
              ],
            },
          },
        },


        // ===============================================
        // OPEN EMAIL
        // ===============================================

        {
          type: "function",

          function: {

            name:
              "openEmail",

            description:
              "Open an email. Use latest for the latest email.",

            parameters: {

              type: "object",

              properties: {

                emailId: {

                  type: "string",

                  description:
                    "Gmail message ID or latest.",
                },
              },

              required: [
                "emailId",
              ],
            },
          },
        },


        // ===============================================
        // REPLY EMAIL
        // ===============================================

        {
          type: "function",

          function: {

            name:
              "replyToEmail",

            description:
              "Prepare a reply to an email. Never send automatically.",

            parameters: {

              type: "object",

              properties: {

                emailId: {

                  type: "string",

                  description:
                    "Gmail message ID. Use current for currently opened email.",
                },

                body: {

                  type: "string",

                  description:
                    "Complete reply body.",
                },
              },

              required: [
                "emailId",
                "body",
              ],
            },
          },
        },
      ];

      // =================================================
      // SYSTEM PROMPT
      // =================================================

      const systemPrompt = `

You are Nebula AI inside Nebula Mail.

Your job is to understand email commands
and control the email application.


==============================
COMPOSE EMAIL
==============================

If the user asks to compose,
draft, write or prepare an email:

ALWAYS use composeEmail.

Never invent an email address.

Do not send automatically.

The user must review and click Send.


==============================
SEARCH / FILTER
==============================

If the user asks to show,
find, search or filter emails:

ALWAYS use filterEmails.

Unread emails:
filterType = unread

Read emails:
filterType = read

Today's emails:
filterType = today

This week's emails:
filterType = this_week

Last 10 days:
filterType = last_10_days

From a person:
filterType = sender

Containing a word, phrase or topic:
filterType = keyword


==============================
OPEN EMAIL
==============================

If the user asks to open,
view or read an email:

ALWAYS use openEmail.

For:

Open my latest email
Open the latest email
Show my latest email
Read my latest email

use:

emailId = latest

Never invent Gmail IDs.


==============================
REPLY
==============================

If the user asks to reply:

ALWAYS use replyToEmail.

If the user says:

Reply to this

use:

emailId = current

The currently opened email is available
in CURRENT CONTEXT.

Write the reply according to
the user's request.

Never invent the recipient.

The application determines
the original sender.

NEVER send the reply automatically.

Only prepare the reply for review.


==============================
CURRENT CONTEXT
==============================

${JSON.stringify(
  context || {}
)}

`;

      // =================================================
      // GROQ REQUEST
      // =================================================

      const groqResponse =
        await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${process.env.GROQ_API_KEY}`,
            },

            body:
              JSON.stringify({

                model:
                  "openai/gpt-oss-20b",

                messages: [

                  {
                    role: "system",

                    content:
                      systemPrompt,
                  },

                  {
                    role: "user",

                    content:
                      message,
                  },

                ],

                tools,

                tool_choice:
                  "auto",

                temperature:
                  0.2,

                max_tokens:
                  1000,
              }),
          }
        );

      // =================================================
      // GROQ RESPONSE
      // =================================================

      const responseText =
        await groqResponse.text();

      let groqData;

      try {

        groqData =
          JSON.parse(
            responseText
          );

      } catch {

        groqData = {
          raw:
            responseText,
        };
      }

      console.log(
        "Groq HTTP Status:",
        groqResponse.status
      );

      // =================================================
      // GROQ ERROR
      // =================================================

      if (!groqResponse.ok) {

        console.error(
          "❌ GROQ API ERROR:",
          groqData
        );

        const errorMessage =
          groqData?.error?.message ||
          groqData?.message ||
          "Unknown Groq API error";

        return res
          .status(
            groqResponse.status
          )
          .json({

            error:
              `Groq error: ${errorMessage}`,

          });
      }

      // =================================================
      // ASSISTANT MESSAGE
      // =================================================

      const assistantMessage =
        groqData
          ?.choices?.[0]
          ?.message;

      if (!assistantMessage) {

        return res
          .status(500)
          .json({

            error:
              "Groq returned an invalid response",

          });
      }

      // =================================================
      // TOOL CALL
      // =================================================

      const toolCall =
        assistantMessage
          .tool_calls?.[0];

      if (toolCall) {

        const functionName =
          toolCall
            .function
            ?.name;

        let args = {};

        try {

          args =
            JSON.parse(
              toolCall
                .function
                ?.arguments ||
              "{}"
            );

        } catch {

          return res
            .status(500)
            .json({

              error:
                "AI returned invalid tool data",

            });
        }

        console.log(
          "🔧 AI Tool:",
          functionName,
          args
        );

        // =================================================
        // COMPOSE
        // =================================================

        if (
          functionName ===
          "composeEmail"
        ) {

          return res.json({

            action:
              "composeEmail",

            data: {

              to:
                args.to || "",

              subject:
                args.subject || "",

              body:
                args.body || "",
            },

            message:
              "Email prepared successfully.",
          });
        }

        // =================================================
        // FILTER
        // =================================================

        if (
          functionName ===
          "filterEmails"
        ) {

          const filterType =
            args.filterType || "";

          const value =
            args.value || "";

          const gmailQuery =
            buildGmailQuery(
              filterType,
              value
            );

          try {

            const emails =
              await getGmailEmails(
                req,
                {

                  label:
                    context?.currentFolder ||
                    "INBOX",

                  query:
                    gmailQuery,
                }
              );

            return res.json({

              action:
                "filterEmails",

              data: {

                emails,

                filterType,

                value,

                query:
                  gmailQuery,
              },

              message:
                emails.length
                  ? `Found ${emails.length} matching email${emails.length === 1 ? "" : "s"}.`
                  : "No matching emails found.",
            });

          } catch (error) {

            console.error(
              "Filter error:",
              error
            );

            return res
              .status(500)
              .json({

                error:
                  "Failed to search Gmail",

              });
          }
        }

        // =================================================
        // OPEN EMAIL
        // =================================================

        if (
          functionName ===
          "openEmail"
        ) {

          try {

            let email;

            if (
              args.emailId ===
              "latest"
            ) {

              email =
                await getLatestGmailEmail(
                  req,
                  context?.currentFolder ||
                    "INBOX"
                );

            } else {

              email =
                await getSingleGmailEmail(
                  req,
                  args.emailId
                );
            }

            if (!email) {

              return res.json({

                action:
                  "none",

                message:
                  "No email was found to open.",

              });
            }

            return res.json({

              action:
                "openEmail",

              data: {
                email,
              },

              message:
                "Opening your email...",

            });

          } catch (error) {

            console.error(
              "Open email error:",
              error
            );

            return res
              .status(500)
              .json({

                error:
                  "Failed to open email",

              });
          }
        }

        // =================================================
        // REPLY TO EMAIL
        // =================================================

        if (
          functionName ===
          "replyToEmail"
        ) {

          try {

            let originalEmailId =
              args.emailId;

            // ---------------------------------------------
            // CURRENT EMAIL
            // ---------------------------------------------

            if (
              originalEmailId ===
              "current"
            ) {

              originalEmailId =
                context
                  ?.selectedEmail
                  ?.id;
            }

            // ---------------------------------------------
            // NO EMAIL SELECTED
            // ---------------------------------------------

            if (!originalEmailId) {

              return res.json({

                action:
                  "none",

                message:
                  "Please open the email you want to reply to first.",

              });
            }

            // ---------------------------------------------
            // GET ORIGINAL EMAIL
            // ---------------------------------------------

            const originalEmail =
              await getSingleGmailEmail(
                req,
                originalEmailId
              );

            if (!originalEmail) {

              return res.json({

                action:
                  "none",

                message:
                  "I couldn't find that email.",

              });
            }

            // ---------------------------------------------
            // GET SENDER
            // ---------------------------------------------

            const fromHeader =
              originalEmail.from ||
              "";

            const emailMatch =
              fromHeader.match(
                /<([^>]+)>/
              );

            const recipient =
              emailMatch
                ? emailMatch[1]
                : fromHeader.trim();

            if (
              !recipient ||
              !recipient.includes("@")
            ) {

              return res.json({

                action:
                  "none",

                message:
                  "I couldn't determine the original sender's email address.",

              });
            }

            // ---------------------------------------------
            // REPLY SUBJECT
            // ---------------------------------------------

            const originalSubject =
              originalEmail.subject ||
              "";

            const replySubject =
              /^re:/i.test(
                originalSubject
              )
                ? originalSubject
                : `Re: ${originalSubject}`;

            console.log(
              "↩️ Preparing reply to:",
              recipient
            );

            // ---------------------------------------------
            // RETURN REPLY TO FRONTEND
            // ---------------------------------------------

            return res.json({

              action:
                "replyEmail",

              data: {

                to:
                  recipient,

                subject:
                  replySubject,

                body:
                  args.body || "",

                originalEmailId:
                  originalEmail.id,

                threadId:
                  originalEmail.threadId,

                messageId:
                  originalEmail.messageId ||
                  "",
              },

              message:
                "Reply prepared successfully.",

            });

          } catch (error) {

            console.error(
              "Reply error:",
              error.response?.data ||
                error.message
            );

            return res
              .status(500)
              .json({

                error:
                  "Failed to prepare reply",

              });
          }
        }
      }

      // =================================================
      // NORMAL AI RESPONSE
      // =================================================

      return res.json({

        action:
          "none",

        message:
          assistantMessage.content ||
          "I'm ready to help with your emails.",

      });

    } catch (error) {

      console.error(
        "❌ AI SERVER ERROR:",
        error
      );

      res
        .status(500)
        .json({

          error:
            error.message ||
            "AI assistant failed",

        });
    }
  }
);

// =====================================================
// HOME
// =====================================================

app.get(
  "/",
  (req, res) => {

    res.json({

      message:
        "Nebula Mail backend is running!",

    });
  }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
  PORT,
  () => {

    console.log(
      `🚀 Server running on http://localhost:${PORT}`
    );

    console.log(
      `🤖 Groq AI endpoint: http://localhost:${PORT}/api/ai`
    );

  }
);