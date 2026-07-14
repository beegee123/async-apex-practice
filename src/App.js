import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useRef, useEffect, useMemo } from "react";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const TOPICS = [
  {
    id: "future",
    label: "@future",
    icon: "⚡",
    color: "#00D4FF",
    title: "Future Methods",
    summary: "Runs in a separate thread after the current transaction. Fire-and-forget.",
    exercises: [
      "Create a @future method that updates a Contact's Description field",
      "Call your @future method from an Account trigger",
      "Check the Apex Jobs page to see it ran (Setup → Apex Jobs)",
      "Try passing an Id into your future method and querying inside it",
    ],
    code: `public class FutureDemo {

    // @future methods must be static and return void
    // Only primitive types or collections of primitives allowed as params
    @future
    public static void updateContactDesc(Set<Id> contactIds) {
        List<Contact> contacts = [
            SELECT Id, Description
            FROM Contact
            WHERE Id IN :contactIds
        ];

        for (Contact c : contacts) {
            c.Description = 'Updated async at ' + Datetime.now();
        }

        update contacts;
    }

    // @future(callout=true) — needed for HTTP callouts
    @future(callout=true)
    public static void makeCallout(Id recordId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('https://api.example.com/data');
        req.setMethod('GET');
        Http http = new Http();
        HttpResponse res = http.send(req);
        System.debug(res.getBody());
    }
}`,
    gotchas: [
      "Cannot pass sObjects as parameters — only primitives or collections of primitives",
      "Cannot call a @future from another @future",
      "No guaranteed order of execution",
      "Max 50 future calls per transaction",
    ],
  },
  {
    id: "queueable",
    label: "Queueable",
    icon: "🔗",
    color: "#A78BFA",
    title: "Queueable Apex",
    summary: "Like @future but more powerful — can chain jobs and accept complex types.",
    exercises: [
      "Create a Queueable class that queries and updates Accounts",
      "Enqueue it from Anonymous Apex: System.enqueueJob(new MyQueueable())",
      "Chain a second Queueable inside the first one's execute() method",
      "Pass an sObject into your constructor and use it in execute()",
    ],
    code: `public class AccountUpdaterJob implements Queueable {

    private List<Id> accountIds;

    // Constructor — can accept complex types (unlike @future!)
    public AccountUpdaterJob(List<Id> ids) {
        this.accountIds = ids;
    }

    public void execute(QueueableContext ctx) {
        List<Account> accounts = [
            SELECT Id, Description
            FROM Account
            WHERE Id IN :accountIds
        ];

        for (Account a : accounts) {
            a.Description = 'Processed by Queueable: ' + ctx.getJobId();
        }

        update accounts;

        // Chain another job — only 1 chain allowed per execute()
        // Comment this out if you hit depth limits in sandbox
        // System.enqueueJob(new NextJob());
    }
}

// ------ Run this in Anonymous Apex ------
// List<Id> ids = new List<Id>(
//     new Map<Id, Account>([SELECT Id FROM Account LIMIT 5]).keySet()
// );
// Id jobId = System.enqueueJob(new AccountUpdaterJob(ids));
// System.debug('Enqueued Job ID: ' + jobId);`,
    gotchas: [
      "Max chaining depth is 5 in production (1 in developer edition by default)",
      "Only 1 System.enqueueJob() call per execute() — use a loop workaround if needed",
      "Job ID returned immediately but runs asynchronously",
      "Use AsyncApexJob to query job status",
    ],
  },
  {
    id: "batch",
    label: "Batch Apex",
    icon: "📦",
    color: "#34D399",
    title: "Batch Apex",
    summary: "Processes large datasets in chunks (default 200 records). Ideal for mass updates.",
    exercises: [
      "Write a batch class that updates all Contacts' titles to 'Batch Updated'",
      "Run it: Database.executeBatch(new MyBatch(), 200)",
      "Lower the batch size to 50 and observe more execute() calls",
      "Implement finish() to send a debug log when done",
      "Query AsyncApexJob to check status programmatically",
    ],
    code: `public class ContactTitleBatch
    implements Database.Batchable<sObject> {

    // START — defines the scope/query
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator(
            'SELECT Id, Title FROM Contact WHERE Title = null'
        );
    }

    // EXECUTE — called once per chunk (scope size)
    public void execute(Database.BatchableContext bc, List<sObject> scope) {
        List<Contact> contacts = (List<Contact>) scope;

        for (Contact c : contacts) {
            c.Title = 'Batch Updated';
        }

        update contacts;
    }

    // FINISH — called once when all chunks are done
    public void finish(Database.BatchableContext bc) {
        AsyncApexJob job = [
            SELECT Id, Status, NumberOfErrors,
                   JobItemsProcessed, TotalJobItems
            FROM AsyncApexJob
            WHERE Id = :bc.getJobId()
        ];

        System.debug('Batch finished. Status: ' + job.Status);
        System.debug('Processed: ' + job.JobItemsProcessed +
                     ' of ' + job.TotalJobItems);
        System.debug('Errors: ' + job.NumberOfErrors);
    }
}

// ------ Run this in Anonymous Apex ------
// Id jobId = Database.executeBatch(new ContactTitleBatch(), 200);
// System.debug('Batch Job ID: ' + jobId);`,
    gotchas: [
      "Max 5 concurrent batch jobs in an org",
      "Default scope size is 200; max is 2,000",
      "Can't use @future methods inside a batch",
      "Each execute() is its own transaction — governor limits reset per chunk",
      "Use Database.Stateful if you need to accumulate data across chunks",
    ],
  },
  {
    id: "scheduled",
    label: "Scheduled",
    icon: "⏰",
    color: "#FB923C",
    title: "Scheduled Apex",
    summary: "Runs at a defined time or on a recurring schedule using a cron expression.",
    exercises: [
      "Write a Schedulable class that logs 'Scheduled job ran!' in debug",
      "Schedule it to run every minute: '0 * * * * ?'",
      "Find it under Setup → Scheduled Jobs",
      "Abort it: System.abortJob(jobId)",
      "Schedule your Batch class from inside a Schedulable",
    ],
    code: `public class DailyCleanupScheduler implements Schedulable {

    public void execute(SchedulableContext sc) {
        // Option 1: Do logic directly
        System.debug('Scheduled job ran at: ' + Datetime.now());

        // Option 2: Kick off a Batch from here (most common pattern)
        Database.executeBatch(new ContactTitleBatch(), 200);
    }
}

// ------ CRON Expression Format ------
// Seconds Minutes Hours Day-of-Month Month Day-of-Week Year
//
// Every day at midnight:     '0 0 0 * * ?'
// Every hour:                '0 0 * * * ?'
// Every minute (testing):    '0 * * * * ?'
// Mon-Fri at 8am:            '0 0 8 ? * MON-FRI'

// ------ Run this in Anonymous Apex ------
// String cron = '0 0 2 * * ?'; // Every day at 2am
// String jobName = 'Daily Cleanup Job';
// Id jobId = System.schedule(jobName, cron, new DailyCleanupScheduler());
// System.debug('Scheduled Job ID: ' + jobId);

// ------ Abort a scheduled job ------
// System.abortJob(jobId);`,
    gotchas: [
      "Max 100 scheduled jobs in an org at once",
      "Minimum schedule granularity is 1 minute (not seconds)",
      "The Seconds field in the CRON string must always be 0",
      "Cannot schedule from a trigger directly — use Queueable as a bridge",
    ],
  },
];

const CRON_EXAMPLES = [
  { label: "Every day at midnight", expr: "0 0 0 * * ?" },
  { label: "Every hour", expr: "0 0 * * * ?" },
  { label: "Every minute (testing)", expr: "0 * * * * ?" },
  { label: "Mon–Fri at 8am", expr: "0 0 8 ? * MON-FRI" },
  { label: "1st of every month at noon", expr: "0 0 12 1 * ?" },
];

const DARK = {
  bg: '#060b14',
  bgHeader: '#080d18',
  bgCard: '#0a0f1a',
  bgInput: '#1e293b',
  border: '#1e293b',
  borderSub: '#334155',
  text: '#e2e8f0',
  textSub: '#94a3b8',
  textMuted: '#64748b',
  textFaint: '#475569',
  textVeryFaint: '#334155',
  codeBg: '#0a0f1a',
  codeText: '#94a3b8',
  inlineCodeBg: '#1e293b',
};

const LIGHT = {
  bg: '#f8fafc',
  bgHeader: '#f1f5f9',
  bgCard: '#ffffff',
  bgInput: '#e8edf3',
  border: '#e2e8f0',
  borderSub: '#cbd5e1',
  text: '#0f172a',
  textSub: '#334155',
  textMuted: '#475569',
  textFaint: '#64748b',
  textVeryFaint: '#94a3b8',
  codeBg: '#f1f5f9',
  codeText: '#334155',
  inlineCodeBg: '#e2e8f0',
};

const COMPARE_ROWS = [
  { label: "Complex params", future: "❌", queue: "✅", batch: "✅", sched: "✅" },
  { label: "Chaining",       future: "❌", queue: "✅", batch: "❌", sched: "❌" },
  { label: "Huge datasets",  future: "❌", queue: "⚠",  batch: "✅", sched: "❌" },
  { label: "Callouts",       future: "✅", queue: "✅", batch: "✅", sched: "✅" },
  { label: "Scheduling",     future: "❌", queue: "❌", batch: "❌", sched: "✅" },
  { label: "From trigger",   future: "✅", queue: "✅", batch: "⚠",  sched: "❌" },
];

function CopyButton({ text, t }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        background: copied ? "#22c55e22" : t.bgInput,
        border: `1px solid ${copied ? "#22c55e" : t.borderSub}`,
        color: copied ? "#22c55e" : t.textMuted,
        padding: "4px 12px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "monospace",
        transition: "all 0.2s",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function QuickCompare({ activeId, t }) {
  return (
    <>
      <div style={{ fontSize: 11, color: t.textVeryFaint, fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>
        Quick Compare
      </div>
      {COMPARE_ROWS.map((row, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 4, fontFamily: "monospace" }}>{row.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2 }}>
            {[
              { key: "future",    val: row.future, color: "#00D4FF" },
              { key: "queueable", val: row.queue,  color: "#A78BFA" },
              { key: "batch",     val: row.batch,  color: "#34D399" },
              { key: "scheduled", val: row.sched,  color: "#FB923C" },
            ].map((cell) => (
              <div key={cell.key} style={{
                textAlign: "center", fontSize: 12, padding: "3px 0",
                background: activeId === cell.key ? cell.color + "15" : t.bgInput,
                borderRadius: 4,
                border: `1px solid ${activeId === cell.key ? cell.color + "40" : t.border}`,
              }}>
                {cell.val}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2 }}>
        {TOPICS.map((tp) => (
          <div key={tp.id} style={{ textAlign: "center", fontSize: 9, color: tp.color, fontFamily: "monospace" }}>
            {tp.icon}
          </div>
        ))}
      </div>
    </>
  );
}

function AITutor({ topic, chatHistory, setChatHistory, t }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const messages = useMemo(() =>
    chatHistory[topic.id] || [{
      role: 'assistant',
      content: `Hey! I'm your Async Apex tutor. Ask me anything about **${topic.title}**...`
    }],
    [chatHistory, topic.id, topic.title]
  );

  const setMessages = (updater) => {
    setChatHistory(prev => ({
      ...prev,
      [topic.id]: typeof updater === 'function' ? updater(messages) : updater
    }));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: `You are an expert Salesforce developer and Apex tutor helping a developer practice ${topic.title} in their dev org.
Be concise, practical, and developer-friendly. Focus on hands-on guidance.
When showing code, keep it short and directly relevant.
Current topic context: ${topic.summary}
Common gotchas for this topic: ${topic.gotchas.join("; ")}`,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.find((b) => b.type === "text")?.text || "Sorry, I couldn't respond.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection error. Try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: 340,
      background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12,
    }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: topic.color, boxShadow: `0 0 8px ${topic.color}` }} />
        <span style={{ color: t.textMuted, fontSize: 12, fontFamily: "monospace" }}>AI Tutor — {topic.title}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%",
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: m.role === "user" ? topic.color + "22" : t.bgInput,
              border: `1px solid ${m.role === "user" ? topic.color + "44" : t.borderSub}`,
              color: t.text,
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: "system-ui, sans-serif",
              whiteSpace: "pre-wrap",
            }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, inline, className, children, ...props}) {
                    return inline ? (
                      <code style={{ background: t.inlineCodeBg, padding: '2px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', color: t.textSub }}>
                        {children}
                      </code>
                    ) : (
                      <pre style={{ background: t.codeBg, border: `1px solid ${t.borderSub}`, borderRadius: 8, padding: '12px 16px', overflowX: 'auto', margin: '8px 0' }}>
                        <code style={{ fontFamily: 'monospace', fontSize: 12, color: t.codeText, lineHeight: 1.6 }}>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                  table({children}) {
                    return <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>{children}</table>;
                  },
                  th({children}) {
                    return <th style={{ border: `1px solid ${t.borderSub}`, padding: '6px 12px', background: t.bgInput, textAlign: 'left', color: t.text }}>{children}</th>;
                  },
                  td({children}) {
                    return <td style={{ border: `1px solid ${t.borderSub}`, padding: '6px 12px', color: t.textSub }}>{children}</td>;
                  },
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: "8px 14px" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%", background: topic.color,
                animation: "bounce 1s infinite",
                animationDelay: `${i * 0.15}s`,
              }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about this async type..."
          style={{
            flex: 1, background: t.bgInput, border: `1px solid ${t.borderSub}`,
            borderRadius: 8, padding: "8px 12px", color: t.text,
            fontSize: 13, fontFamily: "monospace", outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            background: topic.color, border: "none", borderRadius: 8,
            padding: "8px 16px", color: "#000", fontWeight: 700,
            fontSize: 13, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1, transition: "opacity 0.2s",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

export default function AsyncApexPractice() {
  const [activeId, setActiveId] = useState("future");
  const [checked, setChecked] = useState({});
  const [chatHistory, setChatHistory] = useState({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('apexDarkMode');
    return saved !== null ? saved === 'true' : true;
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('apexDarkMode', String(darkMode));
  }, [darkMode]);

  const t = darkMode ? DARK : LIGHT;

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('chat_history')
        .select('*')
        .single();
      if (data?.history) setChatHistory(data.history);
      setHistoryLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    if (Object.keys(chatHistory).length === 0) return;
    supabase.from('chat_history')
      .upsert({ id: 1, history: chatHistory });
  }, [chatHistory]);

  const topic = TOPICS.find((tp) => tp.id === activeId);

  const toggleCheck = (topicId, idx) => {
    const key = `${topicId}-${idx}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const topicProgress = (topicId) => {
    const tp = TOPICS.find((x) => x.id === topicId);
    const done = tp.exercises.filter((_, i) => checked[`${topicId}-${i}`]).length;
    return { done, total: tp.exercises.length };
  };

  if (!historyLoaded) return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
      Loading...
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: t.bg,
      fontFamily: "system-ui, -apple-system, sans-serif", color: t.text,
    }}>
      <style>{`
        * { box-sizing: border-box; }
        select { appearance: none; }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${t.bgCard}; }
        ::-webkit-scrollbar-thumb { background: ${t.borderSub}; border-radius: 3px; }
        code { font-family: 'Fira Code', 'Courier New', monospace; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: isMobile ? "14px 16px" : "20px 32px", background: t.bgHeader }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 20 }}>☁️</div>
          <div>
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 700, letterSpacing: "-0.5px", color: t.text }}>
              Async Apex <span style={{ color: "#00D4FF" }}>Practice Lab</span>
            </div>
            {!isMobile && (
              <div style={{ fontSize: 12, color: t.textFaint, fontFamily: "monospace" }}>
                hands-on exercises for your dev org
              </div>
            )}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {/* Progress pills — desktop only */}
            {!isMobile && TOPICS.map((tp) => {
              const { done, total } = topicProgress(tp.id);
              return done > 0 ? (
                <div key={tp.id} style={{
                  padding: "3px 10px", borderRadius: 20,
                  background: tp.color + "15", border: `1px solid ${tp.color}40`,
                  fontSize: 11, color: tp.color, fontFamily: "monospace",
                }}>
                  {tp.label} {done}/{total}
                </div>
              ) : null;
            })}
            {/* Theme toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                background: t.bgInput, border: `1px solid ${t.borderSub}`,
                borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                fontSize: 15, lineHeight: 1,
              }}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: horizontal topic tabs */}
      {isMobile && (
        <div style={{
          display: "flex", overflowX: "auto",
          background: t.bgHeader, borderBottom: `1px solid ${t.border}`,
          padding: "0 4px",
          // hide scrollbar on mobile
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}>
          {TOPICS.map((tp) => {
            const active = tp.id === activeId;
            const { done } = topicProgress(tp.id);
            return (
              <div
                key={tp.id}
                onClick={() => setActiveId(tp.id)}
                style={{
                  padding: "11px 14px", cursor: "pointer", flexShrink: 0,
                  borderBottom: `3px solid ${active ? tp.color : "transparent"}`,
                  color: active ? tp.color : t.textMuted,
                  fontSize: 13, fontFamily: "monospace", fontWeight: active ? 600 : 400,
                  whiteSpace: "nowrap", transition: "all 0.15s",
                }}
              >
                {tp.icon} {tp.label}{done > 0 ? ` ·${done}` : ""}
              </div>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div style={{ display: "flex", minHeight: isMobile ? undefined : "calc(100vh - 73px)" }}>

        {/* Desktop sidebar */}
        {!isMobile && (
          <div style={{ width: 180, borderRight: `1px solid ${t.border}`, padding: "20px 0", background: t.bgHeader, flexShrink: 0 }}>
            {TOPICS.map((tp) => {
              const { done, total } = topicProgress(tp.id);
              const active = tp.id === activeId;
              return (
                <div
                  key={tp.id}
                  onClick={() => setActiveId(tp.id)}
                  style={{
                    padding: "12px 20px", cursor: "pointer",
                    borderLeft: `3px solid ${active ? tp.color : "transparent"}`,
                    background: active ? tp.color + "10" : "transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{tp.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? tp.color : t.textMuted, fontFamily: "monospace" }}>
                    {tp.label}
                  </div>
                  {done > 0 && (
                    <div style={{ fontSize: 10, color: "#22c55e", marginTop: 3 }}>
                      {"▓".repeat(done)}{"░".repeat(total - done)}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: "24px 20px 0", borderTop: `1px solid ${t.border}`, marginTop: 16 }}>
              <div style={{ fontSize: 11, color: t.textVeryFaint, fontFamily: "monospace", lineHeight: 1.8 }}>
                <div>📍 Setup → Apex Jobs</div>
                <div>📍 Setup → Scheduled Jobs</div>
                <div>📍 Dev Console → Debug</div>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px" : "28px 32px", maxWidth: isMobile ? "100%" : 900 }}>

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: isMobile ? 24 : 28 }}>{topic.icon}</span>
              <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: topic.color }}>
                {topic.title}
              </h1>
            </div>
            <p style={{ margin: 0, color: t.textSub, fontSize: 14, lineHeight: 1.6 }}>
              {topic.summary}
            </p>
          </div>

          {/* Code block */}
          <div style={{ marginBottom: 24, background: t.codeBg, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: t.textFaint, fontFamily: "monospace" }}>
                {topic.id === "future" ? "FutureDemo.cls" :
                 topic.id === "queueable" ? "AccountUpdaterJob.cls" :
                 topic.id === "batch" ? "ContactTitleBatch.cls" : "DailyCleanupScheduler.cls"}
              </span>
              <CopyButton text={topic.code} t={t} />
            </div>
            <pre style={{
              margin: 0, padding: isMobile ? "14px 16px" : "20px",
              overflowX: "auto", fontSize: 12, lineHeight: 1.7,
              color: t.codeText, fontFamily: "'Fira Code', 'Courier New', monospace",
            }}>
              <code>{topic.code}</code>
            </pre>
          </div>

          {/* Exercises + Gotchas */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 24 }}>

            {/* Exercises */}
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, fontFamily: "monospace", marginBottom: 14, letterSpacing: 1, textTransform: "uppercase" }}>
                Exercises
              </div>
              {topic.exercises.map((ex, i) => {
                const key = `${topic.id}-${i}`;
                const done = checked[key];
                return (
                  <div
                    key={i}
                    onClick={() => toggleCheck(topic.id, i)}
                    style={{
                      display: "flex", gap: 10, padding: "8px 0", cursor: "pointer",
                      alignItems: "flex-start",
                      borderBottom: i < topic.exercises.length - 1 ? `1px solid ${t.border}` : "none",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      border: `2px solid ${done ? topic.color : t.borderSub}`,
                      background: done ? topic.color + "25" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      {done && <span style={{ fontSize: 11, color: topic.color }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, color: done ? t.textMuted : t.textSub, textDecoration: done ? "line-through" : "none", lineHeight: 1.5 }}>
                      {ex}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Gotchas */}
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, fontFamily: "monospace", marginBottom: 14, letterSpacing: 1, textTransform: "uppercase" }}>
                ⚠ Gotchas
              </div>
              {topic.gotchas.map((g, i) => (
                <div key={i} style={{
                  display: "flex", gap: 8, padding: "7px 0",
                  borderBottom: i < topic.gotchas.length - 1 ? `1px solid ${t.border}` : "none",
                }}>
                  <span style={{ color: "#f59e0b", fontSize: 12, marginTop: 2, flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: 12.5, color: t.textSub, lineHeight: 1.5 }}>{g}</span>
                </div>
              ))}

              {/* CRON quick reference */}
              {topic.id === "scheduled" && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: 11, color: t.textFaint, fontFamily: "monospace", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>CRON Quick Reference</div>
                  {CRON_EXAMPLES.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", flexWrap: "wrap", gap: 4 }}>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{c.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <code style={{ fontSize: 11, color: "#fb923c", background: t.bgInput, padding: "2px 6px", borderRadius: 4 }}>{c.expr}</code>
                        <CopyButton text={c.expr} t={t} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* AI Tutor */}
          <div style={{ marginBottom: isMobile ? 24 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, fontFamily: "monospace", marginBottom: 12, letterSpacing: 1, textTransform: "uppercase" }}>
              💬 Ask the AI Tutor
            </div>
            <AITutor
              topic={topic}
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
              t={t}
            />
          </div>

          {/* Mobile: Quick Compare at bottom */}
          {isMobile && (
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <QuickCompare activeId={activeId} t={t} />
            </div>
          )}

          {/* Mobile: Apex shortcuts */}
          {isMobile && (
            <div style={{ fontSize: 11, color: t.textVeryFaint, fontFamily: "monospace", lineHeight: 2, textAlign: "center", paddingBottom: 16 }}>
              📍 Setup → Apex Jobs &nbsp;·&nbsp; 📍 Setup → Scheduled Jobs &nbsp;·&nbsp; 📍 Dev Console → Debug
            </div>
          )}
        </div>

        {/* Desktop: Right panel */}
        {!isMobile && (
          <div style={{ width: 200, borderLeft: `1px solid ${t.border}`, padding: 20, background: t.bgHeader, flexShrink: 0 }}>
            <QuickCompare activeId={activeId} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}
