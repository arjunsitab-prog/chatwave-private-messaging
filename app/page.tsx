"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Search, Plus, Send, MessageCircle, Users, LogOut, LockKeyhole, ArrowLeft, UserRound, Loader2 } from "lucide-react";

type Profile = { id: string; username: string; display_name: string; avatar_color?: string; };
type Chat = { id: string; other: Profile; lastMessage?: string; updated_at?: string; };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; };

const demoPeople: Profile[] = [
  { id: "demo-maya", username: "maya", display_name: "Maya Chen", avatar_color: "#2563eb" },
  { id: "demo-alex", username: "alex", display_name: "Alex Morgan", avatar_color: "#3b82f6" },
  { id: "demo-sarah", username: "sarah", display_name: "Sarah Wilson", avatar_color: "#1d4ed8" },
  { id: "demo-ryan", username: "ryan", display_name: "Ryan Cooper", avatar_color: "#0284c7" },
  { id: "demo-jordan", username: "jordan", display_name: "Jordan Lee", avatar_color: "#1e40af" }
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
  const [supabaseUrl] = useState(() => process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const [supabaseAnonKey] = useState(() => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey);
  }, [supabaseUrl, supabaseAnonKey]);

  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [demoActive, setDemoActive] = useState<Profile | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const loadData = async () => {
    if (!supabase || !session) return;
    setLoadingChats(true);
    try {
      const me = session.user.id;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_color")
        .neq("id", me)
        .order("display_name");

      setPeople((profiles || []) as Profile[]);

      const { data: memberships } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations(id, updated_at, conversation_members(user_id, profiles(id, username, display_name, avatar_color)))");

      const found: Chat[] = [];
      for (const row of (memberships || []) as any[]) {
        const convo = row.conversations;
        if (!convo) continue;
        const member = (convo.conversation_members || []).find((m: any) => m.user_id !== me);
        if (!member?.profiles) continue;
        const { data: last } = await supabase
          .from("messages")
          .select("body")
          .eq("conversation_id", convo.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        found.push({
          id: convo.id,
          other: member.profiles,
          lastMessage: last?.body || "Start a conversation",
          updated_at: convo.updated_at
        });
      }
      setChats(found);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [supabase, session]);

  useEffect(() => {
    if (!supabase || !activeChat) return;
    setLoadingMessages(true);

    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", activeChat.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages((data || []) as Message[]);
        setLoadingMessages(false);
      });

    const channel = supabase
      .channel(`chat:${activeChat.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeChat.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activeChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError("");
    setLoadingAuth(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.user) {
          const { error: pErr } = await supabase.from("profiles").upsert({
            id: data.user.id,
            username: username || email.split("@")[0],
            display_name: displayName || username || email.split("@")[0],
            avatar_color: "#2563eb"
          });
          if (pErr) console.error("Profile creation error:", pErr);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setLoadingAuth(false);
    }
  };

  const startChat = async (other: Profile) => {
    if (!supabase || !session) return;

    const me = session.user.id;
    const existing = chats.find((c) => c.other.id === other.id);
    if (existing) {
      setActiveChat(existing);
      setDemoActive(null);
      return;
    }

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({})
      .select("id")
      .single();

    if (convErr || !conv) {
      console.error(convErr);
      return;
    }

    await supabase.from("conversation_members").insert([
      { conversation_id: conv.id, user_id: me },
      { conversation_id: conv.id, user_id: other.id }
    ]);

    const newChat: Chat = {
      id: conv.id,
      other,
      lastMessage: "Start a conversation",
      updated_at: new Date().toISOString()
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChat(newChat);
    setDemoActive(null);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (demoActive) {
      const msg = newMessage.trim();
      setNewMessage("");
      demoTexts[demoActive.id] = demoTexts[demoActive.id] || [];
      demoTexts[demoActive.id].push({ body: msg, mine: true, time: "Just now" });
      return;
    }

    if (!supabase || !session || !activeChat) return;

    const body = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("messages").insert({
      conversation_id: activeChat.id,
      sender_id: session.user.id,
      body
    });

    if (error) {
      console.error("Message send error:", error);
      return;
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", activeChat.id);
  };

  const filteredPeople = people.filter(
    (p) =>
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDemo = demoPeople.filter(
    (p) =>
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase())
  );

  if (!session) {
    return (
      <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl shadow-blue-900/20">
          <div className="flex items-center justify-center gap-2 mb-6">
            <MessageCircle className="w-8 h-8 text-blue-500" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Chatbeep
            </h1>
          </div>

          <div className="flex rounded-lg bg-black p-1 mb-6 border border-neutral-800">
            <button
              onClick={() => setAuthMode("login")}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                authMode === "login" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-neutral-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                authMode === "signup" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-neutral-400 hover:text-white"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "signup" && (
              <>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                    placeholder="johndoe"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                    placeholder="John Doe"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-black border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>

            {authError && <p className="text-xs text-rose-400">{authError}</p>}

            <button
              type="submit"
              disabled={loadingAuth}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
            >
              {loadingAuth && <Loader2 className="w-4 h-4 animate-spin" />}
              {authMode === "login" ? "Sign In" : "Sign Up"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-neutral-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-neutral-800 flex flex-col bg-neutral-950">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-lg text-neutral-100">Chatbeep</span>
          </div>
          <button
            onClick={() => supabase?.auth.signOut()}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-black border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-4">
          <div>
            <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Conversations
            </div>
            {chats.length === 0 ? (
              <p className="px-2 py-3 text-xs text-neutral-500">No active chats yet.</p>
            ) : (
              chats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveChat(c);
                    setDemoActive(null);
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition ${
                    activeChat?.id === c.id ? "bg-blue-600/20 border border-blue-500/40 text-white" : "hover:bg-neutral-900 text-neutral-300"
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white text-sm"
                    style={{ backgroundColor: c.other.avatar_color || "#2563eb" }}
                  >
                    {c.other.display_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.other.display_name}</p>
                    <p className="text-xs text-neutral-500 truncate">{c.lastMessage}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div>
            <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              People
            </div>
            {filteredPeople.map((p) => (
              <button
                key={p.id}
                onClick={() => startChat(p)}
                className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-neutral-900 transition group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white text-xs"
                    style={{ backgroundColor: p.avatar_color || "#2563eb" }}
                  >
                    {p.display_name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-200 truncate">{p.display_name}</p>
                    <p className="text-xs text-neutral-500 truncate">@{p.username}</p>
                  </div>
                </div>
                <Plus className="w-4 h-4 text-neutral-500 group-hover:text-blue-400 transition" />
              </button>
            ))}
          </div>

          <div>
            <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Demo Profiles
            </div>
            {filteredDemo.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setDemoActive(p);
                  setActiveChat(null);
                }}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition ${
                  demoActive?.id === p.id ? "bg-blue-600/20 border border-blue-500/40 text-white" : "hover:bg-neutral-900 text-neutral-300"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white text-xs"
                  style={{ backgroundColor: p.avatar_color }}
                >
                  {p.display_name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-200 truncate">{p.display_name}</p>
                  <p className="text-xs text-neutral-500 truncate">Demo User</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col bg-black">
        {activeChat || demoActive ? (
          <>
            <div className="p-4 border-b border-neutral-800 bg-neutral-950 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20"
                style={{
                  backgroundColor: activeChat ? activeChat.other.avatar_color || "#2563eb" : demoActive?.avatar_color
                }}
              >
                {(activeChat ? activeChat.other.display_name : demoActive?.display_name)?.[0]?.toUpperCase()}
              </div>
              <div>
                <h2 className="font-semibold text-neutral-100">
                  {activeChat ? activeChat.other.display_name : demoActive?.display_name}
                </h2>
                <p className="text-xs text-neutral-400">
                  {activeChat ? `@${activeChat.other.username}` : "Demo Mode"}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {demoActive ? (
                (demoTexts[demoActive.id] || []).map((m, i) => (
                  <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl text-sm ${
                        m.mine ? "bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/30" : "bg-neutral-900 text-neutral-200 rounded-bl-none border border-neutral-800"
                      }`}
                    >
                      <p>{m.body}</p>
                      <span className="text-[10px] opacity-60 block text-right mt-1">{m.time}</span>
                    </div>
                  </div>
                ))
              ) : loadingMessages ? (
                <div className="flex items-center justify-center h-full text-neutral-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-neutral-500 text-sm mt-10">
                  No messages yet. Say hello! 👋
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_id === session.user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl text-sm ${
                          mine ? "bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/30" : "bg-neutral-900 text-neutral-200 rounded-bl-none border border-neutral-800"
                        }`}
                      >
                        <p>{m.body}</p>
                        <span className="text-[10px] opacity-60 block text-right mt-1">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={sendMessage} className="p-3 border-t border-neutral-800 bg-neutral-950 flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 px-4 py-2 bg-black border border-neutral-800 rounded-xl text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition flex items-center justify-center shadow-md shadow-blue-600/30"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
            <MessageCircle className="w-12 h-12 mb-3 text-neutral-800" />
            <p className="text-base font-medium">Select a chat or person to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
