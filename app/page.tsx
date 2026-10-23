'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import {
  Send, Image as ImageIcon, LogOut, Search, User as UserIcon, Plus, Mic, Square,
  Settings, X, Volume2, Check, Trash2, ChevronDown, Archive, VolumeX, Pin,
  Heart, Ban, Eraser, MoreVertical, Flag
} from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  image_url?: string;
  audio_url?: string;
  created_at: string;
}

interface Contact {
  id: string;
  email: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  isUnread?: boolean;
  isBlocked?: boolean;
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);

  // Profile & Settings
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Hey there! I am using Chatbeep.');

  // Contacts State
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [openMenuContactId, setOpenMenuContactId] = useState<string | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);

  // Image Preview Modal State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Messaging State
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Voice Recording State & Refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Chatbeep';
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuContactId(null);
      setShowChatHeaderMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Auth Session Handler
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) setDisplayName(session.user.email.split('@')[0]);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) setDisplayName(session.user.email.split('@')[0]);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch Saved Contacts
  useEffect(() => {
    if (!user) return;
    const myId = user.email || user.id;

    supabase
      .from('messages')
      .select('sender_id, recipient_id')
      .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
      .then(({ data }) => {
        if (data) {
          const contactSet = new Set<string>();
          data.forEach((m) => {
            if (m.sender_id && m.sender_id !== myId) contactSet.add(m.sender_id);
            if (m.recipient_id && m.recipient_id !== myId) contactSet.add(m.recipient_id);
          });
          setContacts(Array.from(contactSet).map((e) => ({ id: e, email: e })));
        }
      });
  }, [user]);

  // Realtime Presence
  useEffect(() => {
    if (!user) return;
    const room = supabase.channel('online-users', {
      config: { presence: { key: user.email || user.id } },
    });

    room
      .on('presence', { event: 'sync' }, () => {
        setOnlineUsers(new Set(Object.keys(room.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await room.track({ online_at: new Date().toISOString() });
      });

    return () => { supabase.removeChannel(room); };
  }, [user]);

  // Fetch & Subscribe to Messages
  useEffect(() => {
    if (!user || !selectedUser) return;
    const myId = user.email || user.id;
    const otherId = selectedUser.email;

    supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setMessages(data.filter((m) => (m.sender_id === myId && m.recipient_id === otherId) || (m.sender_id === otherId && m.recipient_id === myId)));
        }
      });

    const channel = supabase
      .channel(`public:messages:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        if ((msg.sender_id === myId && msg.recipient_id === otherId) || (msg.sender_id === otherId && msg.recipient_id === myId)) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, selectedUser]);

  const handleAddContact = () => {
    if (!searchQuery.trim()) return;
    const newContact = { id: searchQuery.trim(), email: searchQuery.trim() };
    if (!contacts.some((c) => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setContacts((prev) => [...prev, newContact]);
    }
    setSelectedUser(newContact);
    setSearchQuery('');
  };

  const toggleContactProperty = (email: string, prop: keyof Contact) => {
    setContacts((prev) => prev.map((c) => (c.email === email ? { ...c, [prop]: !c[prop] } : c)));
  };

  const handleClearChat = async (targetEmail: string) => {
    if (!user) return;
    const myId = user.email || user.id;
    setMessages([]);
    await supabase.from('messages').delete().or(`and(sender_id.eq.${myId},recipient_id.eq.${targetEmail}),and(sender_id.eq.${targetEmail},recipient_id.eq.${myId})`);
  };

  const handleDeleteChat = async (targetEmail: string) => {
    await handleClearChat(targetEmail);
    setContacts((prev) => prev.filter((c) => c.email !== targetEmail));
    if (selectedUser?.email === targetEmail) setSelectedUser(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else alert('Account created! Sign in now.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await supabase.from('messages').delete().eq('id', messageId);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser || selectedUser.isBlocked) return;

    const msg = {
      sender_id: user.email || user.id,
      recipient_id: selectedUser.email,
      content: newMessage,
      created_at: new Date().toISOString(),
    };

    const tempId = Math.random().toString();
    setMessages((prev) => [...prev, { ...msg, id: tempId }]);
    setNewMessage('');

    const { data } = await supabase.from('messages').insert([msg]).select();
    if (data && data[0]) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data[0] : m)));
      if (!contacts.some((c) => c.email === selectedUser.email)) {
        setContacts((prev) => [...prev, selectedUser]);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !user || !selectedUser) return;
    setUploading(true);
    const file = e.target.files[0];
    const filePath = `images/${Math.random()}.${file.name.split('.').pop()}`;

    await supabase.storage.from('chat-attachments').upload(filePath, file);
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

    await supabase.from('messages').insert([{
      sender_id: user.email || user.id,
      recipient_id: selectedUser.email,
      content: '📷 Image',
      image_url: data.publicUrl,
      created_at: new Date().toISOString(),
    }]);
    setUploading(false);
  };

  // Fixed Voice Note Handler
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const filePath = `voice/${Math.random()}.webm`;
        await supabase.storage.from('chat-attachments').upload(filePath, blob);
        const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

        if (user && selectedUser) {
          await supabase.from('messages').insert([{
            sender_id: user.email || user.id,
            recipient_id: selectedUser.email,
            content: '🎙️ Voice Note',
            audio_url: data.publicUrl,
            created_at: new Date().toISOString(),
          }]);
        }

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      alert('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  if (loadingSession) {
    return <div className="flex items-center justify-center min-h-screen bg-black text-white">Loading Chatbeep...</div>;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white p-4">
        <div className="w-full max-w-md bg-zinc-950 p-6 rounded-xl border border-blue-900/50 shadow-2xl">
          <h1 className="text-2xl font-bold text-blue-400 mb-1">Chatbeep</h1>
          <p className="text-xs text-gray-400 mb-6">Messaging Platform</p>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="••••••••" />
            </div>
            {authError && <p className="text-red-400 text-xs">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded text-white font-semibold transition">{authMode === 'login' ? 'Sign In' : 'Create Account'}</button>
          </form>
          <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="mt-4 w-full text-center text-xs text-blue-400 hover:underline">
            {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    );
  }

  const archivedCount = contacts.filter((c) => c.isArchived).length;
  const sortedContacts = contacts
    .filter((c) => (viewArchived ? c.isArchived : !c.isArchived))
    .filter((c) => c.email.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  return (
    <div className="flex h-screen h-[100dvh] bg-black text-white overflow-hidden relative">
      {/* Lightbox Modal for Opening Images */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 bg-zinc-800 text-white rounded-full hover:bg-zinc-700">
            <X className="w-6 h-6" />
          </button>
          <img src={previewImage} alt="Expanded View" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-blue-900/50 rounded-xl p-6 w-full max-w-md relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center space-x-2"><Settings className="w-5 h-5" /><span>Settings</span></h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status Message</label>
                <input type="text" value={statusMessage} onChange={(e) => setStatusMessage(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-white" />
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded text-white font-medium text-sm">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-80 border-r border-blue-900/40 bg-zinc-950 flex flex-col shrink-0">
        <div className="p-4 border-b border-blue-900/40 flex items-center justify-between bg-zinc-900/30">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm text-white">CB</div>
            <span className="font-bold text-blue-400 text-lg">Chatbeep</span>
          </div>
          <div className="flex items-center space-x-1">
            <button onClick={() => setShowSettings(true)} title="Settings" className="p-2 text-gray-400 hover:text-blue-400 rounded-lg"><Settings className="w-5 h-5" /></button>
            <button onClick={() => supabase.auth.signOut()} title="Log Out" className="p-2 text-gray-400 hover:text-red-400 rounded-lg"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-3 border-b border-zinc-900 flex space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
            <input type="text" placeholder="Search or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddContact()} className="w-full bg-zinc-900 text-xs rounded-lg pl-9 pr-3 py-2 text-white border border-zinc-800 focus:outline-none focus:border-blue-500" />
          </div>
          {searchQuery.trim() && <button onClick={handleAddContact} className="bg-blue-600 hover:bg-blue-500 px-3 rounded-lg text-white"><Plus className="w-4 h-4" /></button>}
        </div>

        <div className="p-2 border-b border-zinc-900 flex justify-between space-x-1">
          <button onClick={() => setViewArchived(false)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${!viewArchived ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-zinc-900'}`}>Chats</button>
          <button onClick={() => setViewArchived(true)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${viewArchived ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-zinc-900'}`}>Archived ({archivedCount})</button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="px-3 py-1 text-[10px] font-bold text-gray-500 uppercase">{viewArchived ? 'Archived Chats' : 'Conversations'}</p>
          {sortedContacts.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-500">{viewArchived ? 'No archived chats.' : 'No conversations yet.'}</div>
          ) : (
            sortedContacts.map((c) => {
              const isSelected = selectedUser?.email === c.email;
              const isOnline = onlineUsers.has(c.email);
              const isMenuOpen = openMenuContactId === c.email;

              return (
                <div key={c.email} className="relative group">
                  <button onClick={() => setSelectedUser(c)} className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition ${isSelected ? 'bg-blue-600/20 border border-blue-500/40 text-white' : 'hover:bg-zinc-900 text-gray-300'}`}>
                    <div className="flex items-center space-x-3 truncate">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-blue-400">{c.email[0].toUpperCase()}</div>
                        {isOnline ? <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-zinc-950 rounded-full flex items-center justify-center"><Check className="w-2 h-2 text-black stroke-[3]" /></span> : <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-zinc-700 border-2 border-zinc-950 rounded-full" />}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center space-x-1">
                          <p className="text-xs font-semibold text-white truncate">{c.email}</p>
                          {c.isPinned && <Pin className="w-3 h-3 text-blue-400 fill-blue-400 shrink-0" />}
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{isOnline ? 'Online' : 'Offline'}</p>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenMenuContactId(isMenuOpen ? null : c.email); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-white rounded ml-1"><ChevronDown className="w-4 h-4" /></button>
                  </button>

                  {isMenuOpen && (
                    <div onClick={(e) => e.stopPropagation()} className="absolute right-2 top-10 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-50 py-1 text-xs text-gray-200">
                      <button onClick={() => { toggleContactProperty(c.email, 'isArchived'); setOpenMenuContactId(null); }} className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-zinc-800 text-left"><Archive className="w-3.5 h-3.5 text-gray-400" /><span>{c.isArchived ? 'Unarchive' : 'Archive'}</span></button>
                      <button onClick={() => { toggleContactProperty(c.email, 'isPinned'); setOpenMenuContactId(null); }} className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-zinc-800 text-left"><Pin className="w-3.5 h-3.5 text-gray-400" /><span>{c.isPinned ? 'Unpin' : 'Pin'}</span></button>
                      <button onClick={() => { toggleContactProperty(c.email, 'isFavorite'); setOpenMenuContactId(null); }} className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-zinc-800 text-left"><Heart className="w-3.5 h-3.5 text-gray-400" /><span>Favorite</span></button>
                      <div className="border-t border-zinc-800 my-1" />
                      <button onClick={() => { handleDeleteChat(c.email); setOpenMenuContactId(null); }} className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-zinc-800 text-left text-red-500 font-semibold"><Trash2 className="w-3.5 h-3.5" /><span>Delete chat</span></button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-zinc-900 bg-zinc-900/50 flex items-center space-x-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">{displayName ? displayName[0].toUpperCase() : 'U'}</div>
          <div className="flex-1 truncate">
            <p className="text-xs font-semibold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-gray-400 truncate">{statusMessage}</p>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-black overflow-hidden">
        {selectedUser ? (
          <>
            <div className="p-4 border-b border-blue-900/40 flex items-center justify-between bg-zinc-950 shrink-0 relative">
              <div className="flex items-center space-x-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">{selectedUser.email[0].toUpperCase()}</div>
                  {onlineUsers.has(selectedUser.email) ? <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-black rounded-full flex items-center justify-center"><Check className="w-2 h-2 text-black stroke-[3]" /></span> : <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-zinc-700 border-2 border-black rounded-full" />}
                </div>
                <div>
                  <h2 className="font-semibold text-blue-400">{selectedUser.email}</h2>
                  <p className="text-xs text-gray-500">{onlineUsers.has(selectedUser.email) ? 'Online' : 'Offline'}</p>
                </div>
              </div>

              {/* Chat Menu Header */}
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setShowChatHeaderMenu(!showChatHeaderMenu); }} className="p-2 text-gray-400 hover:text-white hover:bg-zinc-900 rounded-lg transition"><MoreVertical className="w-5 h-5" /></button>
                {showChatHeaderMenu && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-12 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-50 py-1 text-xs text-gray-200">
                    <button onClick={() => { toggleContactProperty(selectedUser.email, 'isMuted'); setShowChatHeaderMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-zinc-800 text-left"><VolumeX className="w-4 h-4 text-gray-400" /><span>{selectedUser.isMuted ? 'Unmute' : 'Mute notifications'}</span></button>
                    <button onClick={() => { toggleContactProperty(selectedUser.email, 'isFavorite'); setShowChatHeaderMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-zinc-800 text-left"><Heart className="w-4 h-4 text-gray-400" /><span>Add to Favorites</span></button>
                    <button onClick={() => { setSelectedUser(null); setShowChatHeaderMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-zinc-800 text-left"><X className="w-4 h-4 text-gray-400" /><span>Close chat</span></button>
                    <div className="border-t border-zinc-800 my-1" />
                    <button onClick={() => { toggleContactProperty(selectedUser.email, 'isBlocked'); setShowChatHeaderMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-zinc-800 text-left text-yellow-400"><Ban className="w-4 h-4" /><span>{selectedUser.isBlocked ? 'Unblock' : 'Block'}</span></button>
                    <button onClick={() => { handleClearChat(selectedUser.email); setShowChatHeaderMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-zinc-800 text-left text-red-400"><Eraser className="w-4 h-4" /><span>Clear chat</span></button>
                    <button onClick={() => { handleDeleteChat(selectedUser.email); setShowChatHeaderMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-zinc-800 text-left text-red-500 font-semibold"><Trash2 className="w-4 h-4" /><span>Delete chat</span></button>
                  </div>
                )}
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
                  <UserIcon className="w-10 h-10 text-zinc-800" />
                  <p className="text-sm">No messages yet with {selectedUser.email}. Say hello!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === user.email || msg.sender_id === user.id;
                  return (
                    <div key={msg.id} className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center space-x-2">
                        {isMe && <button onClick={() => handleDeleteMessage(msg.id)} title="Delete message" className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                        <div className={`max-w-xs md:max-w-md p-3 rounded-xl ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-zinc-900 text-gray-200 rounded-bl-none border border-zinc-800'}`}>
                          {msg.image_url && (
                            <img
                              src={msg.image_url}
                              alt="Attachment"
                              onClick={() => setPreviewImage(msg.image_url || null)}
                              className="rounded-lg mb-2 max-h-60 object-cover cursor-pointer hover:opacity-90 transition"
                            />
                          )}
                          {msg.audio_url && (
                            <div className="flex items-center space-x-2 my-1">
                              <Volume2 className="w-5 h-5 text-blue-300" />
                              <audio controls src={msg.audio_url} className="w-full max-w-[200px]" />
                            </div>
                          )}
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-blue-900/40 flex items-center space-x-2 bg-zinc-950 shrink-0">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="p-2 text-blue-400 hover:text-blue-300 hover:bg-zinc-900 rounded-lg"><ImageIcon className="w-5 h-5" /></button>
              
              {/* Voice Note Button */}
              {isRecording ? (
                <button type="button" onClick={stopRecording} className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg animate-pulse flex items-center space-x-1">
                  <Square className="w-5 h-5" />
                  <span className="text-xs font-semibold pr-1">Stop Recording</span>
                </button>
              ) : (
                <button type="button" onClick={startRecording} title="Voice Note" className="p-2 text-blue-400 hover:text-blue-300 hover:bg-zinc-900 rounded-lg">
                  <Mic className="w-5 h-5" />
                </button>
              )}

              <input type="text" disabled={selectedUser.isBlocked} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={selectedUser.isBlocked ? 'User is blocked' : `Message ${selectedUser.email}...`} className="flex-1 bg-zinc-900 text-white px-4 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50" />
              <button type="submit" disabled={selectedUser.isBlocked} className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition disabled:opacity-50"><Send className="w-5 h-5" /></button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
            <UserIcon className="w-12 h-12 text-zinc-800" />
            <p className="text-sm">Select a chat or search an email on the left to start messaging!</p>
          </div>
        )}
      </div>
    </div>
  );
}
