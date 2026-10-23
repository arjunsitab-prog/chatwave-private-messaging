"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Search, Plus, Send, MessageCircle, Users, LogOut, LockKeyhole, ArrowLeft, UserRound, LoaderCircle } from "lucide-react";

type Profile = { id: string; username: string; display_name: string; avatar_color?: string; };
type Chat = { id: string; other: Profile; lastMessage?: string; updated_at?: string; };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; };

const demoPeople: Profile[] = [
  { id: "demo-maya", username: "maya", display_name: "Maya Chen", avatar_color: "#8b7cf6" },
  { id: "demo-alex", username: "alex", display_name: "Alex Morgan", avatar_color: "#eaa16e" },
  { id: "demo-sarah", username: "sarah", display_name: "Sarah Wilson", avatar_color: "#54b9a8" },
  { id: "demo-ryan", username: "ryan", display_name: "Ryan Cooper", avatar_color: "#e17d9c" },
  { id: "demo-jordan", username: "jordan", display_name: "Jordan Lee", avatar_color: "#7199e8" }
];
const demoTexts: Record<string, { body: string; mine: boolean; time: string }[]> = {
  "demo-maya": [
    { body: "Hey! How are you doing? 😊", mine: false, time: "10:32 AM" },
    { body: "Are we still meeting today?", mine: false, time: "10:34 AM" },
    { body: "Yes! Sounds good. See you soon!", mine: true, time: "10:36 AM" },
    { body: "Perfect! 🎉", mine: false, time: "10:37 AM" }
  ],
  "demo-alex": [{ body: "Send me the details when you can.", mine: false, time: "10:21 AM" }],
  "demo-sarah": [{ body: "Thank you!!", mine: false, time: "Yesterday" }],
  "demo-ryan": [{ body: "See you tomorrow.", mine: false, time: "Yesterday" }],
  "demo-jordan": [{ body: "That looks amazing 🔥", mine: false, time: "Monday" }]
};

export default function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && key && !url.includes("YOUR_PROJECT") && !key.includes("YOUR_SUPABASE"));
  const supabase = useMemo<SupabaseClient | null>(() => configured ? createClient(url!, key!) : null, [configured, url, key]);

  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>(demoPeople);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("demo-maya");
  const [messages, setMessages] = useState<Message[]>([]);
  const [demoMessages, setDemoMessages] = useState<Record<string, { body: string; mine: boolean; time: string }[]>>(demoTexts);
  const [draft, setDraft] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session && supabase) { void loadAppData(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, supabase]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, demoMessages, activeId]);

  async function loadAppData() {
    if (!supabase || !session) return;
    const me = session.user.id;
    const { data: profiles } = await supabase.from("profiles").select("id,username,display_name,avatar_color").neq("id", me).order("display_name");
    setPeople((profiles || []) as Profile[]);
    const { data: memberships } = await supabase.from("").select("conversation_id, conversations(id, updated_at, (user_id, profiles(id,username,display_name,avatar_color)))");
    const found: Chat[] = [];
    for (const row of (memberships || []) as any[]) {
      const convo = row.conversations;
      if (!convo) continue;
      const member = (const member = (convo.members || []).find((m: any) => m.user_id !== me); || []).find((m: any) => m.user_id !== me);
      if (!member?.profiles) continue;
      const { data: last } = await supabase.from("messages").select("body").eq("conversation_id", convo.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      found.push({ id: convo.id, other: member.profiles, lastMessage: last?.body || "Start a conversation", updated_at: convo.updated_at });
    }
    const unique = Array.from(new Map(found.map(c => [c.id, c])).values());
    setChats(unique);
    if (unique.length && activeId.startsWith("demo-")) setActiveId(unique[0].id);
  }

  async function authenticate(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setAuthLoading(true); setAuthError("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthError(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthError("Check your email to confirm your account, then log in.");
    setAuthLoading(false);
  }

  const activeChat = chats.find(c => c.id === activeId);
  const activePerson = activeChat?.other || people.find(p => p.id === activeId) || demoPeople.find(p => p.id === activeId) || demoPeople[0];
  const isDemo = !session || activeId.startsWith("demo-");
  const currentMessages = isDemo
    ? (demoMessages[activePerson.id] || []).map((m, i) => ({ id: `${activePerson.id}-${i}`, conversation_id: activePerson.id, sender_id: m.mine ? "me" : activePerson.id, body: m.body, created_at: m.time }))
    : messages.filter(m => m.conversation_id === activeId);

  const filteredPeople = people.filter(p => `${p.display_name} ${p.username}`.toLowerCase().includes(query.toLowerCase()));
  const filteredChats = chats.filter(c => `${c.other.display_name} ${c.other.username} ${c.lastMessage || ""}`.toLowerCase().includes(query.toLowerCase()));
  const isMine = (m: Message) => isDemo ? m.sender_id === "me" : m.sender_id === session?.user?.id;

  async function openChat(person: Profile) {
    setNotice(""); setMobileChatOpen(true);
    if (!session || !supabase) { setActiveId(person.id); return; }
    const existing = chats.find(c => c.other.id === person.id);
    if (existing) { setActiveId(existing.id); await loadMessages(existing.id); return; }
    const { data: conversationId, error } = await supabase.rpc("create_direct_conversation", { other_user_id: person.id });
    if (error) { setNotice(error.message); return; }
    await loadAppData();
    setActiveId(conversationId as string);
    await loadMessages(conversationId as string);
  }

  async function loadMessages(conversationId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(200);
    if (!error) setMessages(prev => [...prev.filter(m => m.conversation_id !== conversationId), ...((data || []) as Message[])]);
  }

  useEffect(() => {
    if (!session || !supabase || !activeId || activeId.startsWith("demo-")) return;
    void loadMessages(activeId);
    const channel = supabase.channel(`conversation-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, payload => {
        const incoming = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]);
        void supabase!.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeId);
      }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session?.user?.id, supabase]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault(); const body = draft.trim(); if (!body) return;
    if (isDemo) {
      setDemoMessages(prev => ({ ...prev, [activePerson.id]: [...(prev[activePerson.id] || []), { body, mine: true, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] }));
      setDraft(""); return;
    }
    if (!supabase || !activeChat) { setNotice("Choose a conversation first."); return; }
    const { error } = await supabase.from("messages").insert({ conversation_id: activeId, body });
    if (error) setNotice(error.message); else setDraft("");
  }

  async function startByUsername(e: React.FormEvent) {
    e.preventDefault(); const username = newUsername.trim().replace(/^@/, "");
    if (!username) return;
    if (!session) {
      const person = demoPeople.find(p => p.username.toLowerCase() === username.toLowerCase());
      if (person) { await openChat(person); setShowNewChat(false); setNewUsername(""); }
      else setNotice("Demo mode: try maya, alex, sarah, ryan, or jordan. Configure Supabase to find real users.");
      return;
    }
    if (!supabase) return;
    const { data: person, error } = await supabase.from("profiles").select("id,username,display_name,avatar_color").eq("username", username).maybeSingle();
    if (error || !person) { setNotice("No user found with that username."); return; }
    await openChat(person as Profile); setShowNewChat(false); setNewUsername("");
  }

  async function logout() { if (supabase) await supabase.auth.signOut(); setActiveId("demo-maya"); setMobileChatOpen(false); }

  if (configured && !session) return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={authenticate}>
        <div className="brand-mark"><MessageCircle size={26} /></div>
        <div className="eyebrow">PRIVATE MESSAGING</div><h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">Your conversations, all in one place.</p>
        {authMode === "signup" && <label>Display name<input required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" maxLength={40}/></label>}
        <label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>
        {authError && <div className="error">{authError}</div>}
        <button className="primary full" disabled={authLoading}>{authLoading ? <LoaderCircle className="spin" size={17}/> : null}{authMode === "login" ? "Log in" : "Sign up"}</button>
        <p className="switch-auth">{authMode === "login" ? "New to ChatWave?" : "Already have an account?"} <button type="button" className="text-button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>{authMode === "login" ? "Create account" : "Log in"}</button></p>
        <p className="security-note"><LockKeyhole size={14}/> Private conversations with account-based access</p>
      </form>
    </main>
  );

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileChatOpen ? "hide-mobile" : ""}`}>
        <div className="side-brand"><div className="brand-mark small"><MessageCircle size={21}/></div><span>chatwave</span><span className="brand-dot">.</span><span className="demo-tag">{session ? "LIVE" : "DEMO"}</span></div>
        <div className="side-heading"><span>MESSAGES</span><button className="icon-button" onClick={() => { setShowNewChat(!showNewChat); setNotice(""); }} aria-label="New conversation"><Plus size={18}/></button></div>
        <div className="search-box"><Search size={17}/><input placeholder="Search chats or people" value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></div>
        {showNewChat && <form className="new-chat" onSubmit={startByUsername}><label>Start a private chat</label><div className="new-chat-row"><input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="@username" autoFocus/><button className="primary" aria-label="Find user"><ArrowLeft size={16}/></button></div><small>Enter an exact username.</small></form>}
        <div className="section-label">RECENT</div>
        <div className="chat-list">
          {(session ? filteredChats : demoPeople.filter(p => `${p.display_name} ${p.username}`.toLowerCase().includes(query.toLowerCase())).map(p => ({ id: p.id, other: p, lastMessage: demoMessages[p.id]?.slice(-1)[0]?.body || "Start a conversation" }))).map(chat => (
            <button key={chat.id} className={`chat-row ${activeId === chat.id ? "selected" : ""}`} onClick={() => { setActiveId(chat.id); setMobileChatOpen(true); setNotice(""); }}>
              <Avatar person={chat.other} online={chat.other.id === "demo-maya" || chat.other.id === "demo-alex" || chat.other.id === "demo-jordan"}/>
              <span className="chat-row-text"><span className="chat-row-name">{chat.other.display_name}</span><span className="chat-row-preview">{chat.lastMessage || "Say hello 👋"}</span></span>
              <span className="chat-row-time">{(chat as any).updated_at ? new Date((chat as any).updated_at).toLocaleDateString() : ""}</span>
            </button>
          ))}
          {session && filteredChats.length === 0 && <div className="empty-list">No conversations yet.<br/>Use + to find someone by username.</div>}
        </div>
        <div className="section-label people-label"><span>PEOPLE</span><span>{filteredPeople.length}</span></div>
        <div className="people-list">{filteredPeople.slice(0, 6).map(person => <button key={person.id} className="person-row" onClick={() => void openChat(person)}><Avatar person={person} online={false}/><span>{person.display_name}</span><Plus size={15}/></button>)}</div>
        {!configured && <div className="demo-banner"><div className="demo-icon"><LockKeyhole size={17}/></div><div><strong>Preview mode</strong><span>Connect Supabase to enable real accounts and live messaging.</span></div></div>}
        <div className="profile-footer"><Avatar person={{ id: "me", username: "you", display_name: session?.user?.user_metadata?.display_name || session?.user?.email || "Guest", avatar_color: "#7565ef" }}/><div className="profile-text"><strong>{session?.user?.user_metadata?.display_name || session?.user?.email || "Guest User"}</strong><span>{session ? "Signed in" : "Preview account"}</span></div>{session && <button className="icon-button" onClick={() => void logout()} aria-label="Log out"><LogOut size={17}/></button>}</div>
      </aside>

      <section className={`conversation ${!mobileChatOpen ? "hide-mobile" : ""}`}>
        <header className="conversation-header">
          <button className="icon-button mobile-back" onClick={() => setMobileChatOpen(false)} aria-label="Back to chats"><ArrowLeft size={20}/></button>
          <Avatar person={activePerson} online={activePerson.id === "demo-maya" || activePerson.id === "demo-alex" || activePerson.id === "demo-jordan"} large/>
          <div className="header-person"><h2>{activePerson.display_name}</h2><span><i className={`status-dot ${activePerson.id === "demo-maya" || activePerson.id === "demo-alex" || activePerson.id === "demo-jordan" ? "online" : ""}`}/>{session ? "Private conversation" : "Sample conversation"}</span></div>
          <div className="header-actions"><div className="encrypted-label"><LockKeyhole size={14}/> Private chat</div></div>
        </header>
        <div className="message-area">
          <div className="day-divider"><span>YOUR CONVERSATION</span></div>
          {!currentMessages.length && <div className="empty-conversation"><div className="empty-bubble"><MessageCircle size={25}/></div><h3>Say hello to {activePerson.display_name.split(" ")[0]}</h3><p>Your private conversation starts here. Send the first message.</p></div>}
          {currentMessages.map((message, index) => <div key={message.id} className={`message-line ${isMine(message) ? "mine" : "theirs"}`}><div className="message-content">{!isMine(message) && <span className="sender-name">{activePerson.display_name.split(" ")[0]}</span>}<div className={`bubble ${isMine(message) ? "bubble-mine" : "bubble-theirs"}`}>{message.body}</div><span className="message-time">{isDemo ? message.created_at : new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{isMine(message) && <span className="read-check"> ✓</span>}</span></div></div>)}
          <div ref={bottomRef}/>
        </div>
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}
        <form className="composer-wrap" onSubmit={sendMessage}><div className="composer"><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${activePerson.display_name.split(" ")[0]}...`} aria-label="Message" maxLength={5000}/><span className="composer-hint">Enter ↵</span><button className="send-button" disabled={!draft.trim()} aria-label="Send message"><Send size={18}/></button></div><div className="composer-footer"><span><LockKeyhole size={12}/> Only members of this conversation can access messages</span><span>{draft.length}/5000</span></div></form>
      </section>
      <aside className="details-panel">
        <div className="details-top"><span>CONTACT DETAILS</span><div className="details-lock"><LockKeyhole size={15}/></div></div>
        <div className="contact-card"><Avatar person={activePerson} large xl online={activePerson.id === "demo-maya" || activePerson.id === "demo-alex" || activePerson.id === "demo-jordan"}/><h3>{activePerson.display_name}</h3><p>@{activePerson.username}</p><div className="contact-status"><i className={`status-dot ${activePerson.id === "demo-maya" || activePerson.id === "demo-alex" || activePerson.id === "demo-jordan" ? "online" : ""}`}/>{session ? "Chat member" : "Demo contact"}</div></div>
        <div className="detail-divider"/>
        <div className="detail-section"><h4><UserRound size={15}/> ABOUT</h4><p>{session ? "You're connected in a private ChatWave conversation." : "A sample profile for the ChatWave preview."}</p></div>
        <div className="detail-section"><h4><MessageCircle size={15}/> MESSAGES</h4><p>{currentMessages.length} messages in this view</p></div>
        <div className="privacy-card"><LockKeyhole size={17}/><div><strong>Your privacy matters</strong><p>Conversation access is enforced by database policies when Supabase is configured. This is not end-to-end encryption.</p></div></div>
        <div className="details-bottom">CHATWAVE <span>·</span> PRIVATE BY DESIGN</div>
      </aside>
    </main>
  );
}

function Avatar({ person, online = false, large = false, xl = false }: { person: Profile; online?: boolean; large?: boolean; xl?: boolean }) {
  return <span className={`avatar ${large ? "avatar-large" : ""} ${xl ? "avatar-xl" : ""}`} style={{ background: person.avatar_color || "#7565ef" }}><span>{(person.display_name || person.username || "?").trim().slice(0, 1).toUpperCase()}</span>{online && <i className="avatar-online"/>}</span>;
}

