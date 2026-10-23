'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import {
  Send,
  Image as ImageIcon,
  LogOut,
  Search,
  User as UserIcon,
  Plus,
  Mic,
  Square,
  Settings,
  X,
  Volume2,
  Check,
  Trash2
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
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);

  // Profile & Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Hey there! I am using Chatbeep.');

  // Contacts & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);

  // Chat & Messaging
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Chatbeep';
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persistent Session Handler
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setDisplayName(session.user.email.split('@')[0]);
      }
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setDisplayName(session.user.email.split('@')[0]);
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch saved contacts from message history
  useEffect(() => {
    if (!user) return;
    const myId = user.email || user.id;

    const fetchSavedContacts = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id, recipient_id')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`);

      if (!error && data) {
        const contactSet = new Set<string>();
        data.forEach((msg) => {
          if (msg.sender_id && msg.sender_id !== myId) contactSet.add(msg.sender_id);
          if (msg.recipient_id && msg.recipient_id !== myId) contactSet.add(msg.recipient_id);
        });

        const loadedContacts: Contact[] = Array.from(contactSet).map((contactEmail) => ({
          id: contactEmail,
          email: contactEmail,
        }));

        setContacts(loadedContacts);
      }
    };

    fetchSavedContacts();
  }, [user]);

  // Realtime Presence Sync
  useEffect(() => {
    if (!user) return;

    const room = supabase.channel('online-users', {
      config: { presence: { key: user.email || user.id } },
    });

    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState();
        setOnlineUsers(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(room);
    };
  }, [user]);

  // Notification audio beep & push alerts
  const notifyUser = (sender: string, text: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`New message from ${sender}`, {
        body: text,
        icon: '/favicon.ico',
      });
    }
  };

  // Fetch messages & subscribe to Realtime INSERT and DELETE events
  useEffect(() => {
    if (!user || !selectedUser) return;

    const myId = user.email || user.id;
    const otherId = selectedUser.email;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
        .order('created_at', { ascending: true });

      if (!error && data) {
        const conversationMessages = data.filter(
          (m) =>
            (m.sender_id === myId && m.recipient_id === otherId) ||
            (m.sender_id === otherId && m.recipient_id === myId)
        );
        setMessages(conversationMessages);
      }
    };

    fetchMessages();

    // Realtime channel for incoming & deleted messages
    const messageChannel = supabase
      .channel(`public:messages:${myId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as Message;
          const isRelevant =
            (newMsg.sender_id === myId && newMsg.recipient_id === otherId) ||
            (newMsg.sender_id === otherId && newMsg.recipient_id === myId);

          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });

            if (newMsg.sender_id === otherId) {
              notifyUser(otherId, newMsg.content);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const deletedId = payload.old.id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
    };
  }, [user, selectedUser]);

  // Handle Contact Addition
  const handleAddContact = () => {
    if (!searchQuery.trim()) return;
    const newContact: Contact = {
      id: searchQuery.trim(),
      email: searchQuery.trim(),
    };

    if (!contacts.some((c) => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setContacts((prev) => [...prev, newContact]);
    }
    setSelectedUser(newContact);
    setSearchQuery('');
  };

  // Auth Operations
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else alert('Account created! You can now sign in.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Delete Message Handler
  const handleDeleteMessage = async (messageId: string) => {
    // Optimistic local delete
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) {
      console.error('Error deleting message:', error.message);
    }
  };

  // Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser) return;

    const msg = {
      sender_id: user.email || user.id,
      recipient_id: selectedUser.email,
      content: newMessage,
      created_at: new Date().toISOString(),
    };

    const tempId = Math.random().toString();
    setMessages((prev) => [...prev, { ...msg, id: tempId }]);
    setNewMessage('');

    const { data, error } = await supabase.from('messages').insert([msg]).select();
    if (error) {
      console.error('Error sending message:', error.message);
    } else if (data && data[0]) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data[0] : m)));
      
      if (!contacts.some((c) => c.email === selectedUser.email)) {
        setContacts((prev) => [...prev, selectedUser]);
      }
    }
  };

  // Image Attachment Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user || !selectedUser) return;
    try {
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `images/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

      const msg = {
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '📷 Image Attachment',
        image_url: data.publicUrl,
        created_at: new Date().toISOString(),
      };

      await supabase.from('messages').insert([msg]);
    } catch (err: any) {
      console.error('Upload error:', err?.message || err);
    } finally {
      setUploading(false);
    }
  };

  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioMessage(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone permission required for voice notes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudioMessage = async (audioBlob: Blob) => {
    if (!user || !selectedUser) return;
    try {
      setUploading(true);
      const filePath = `voice-notes/${Math.random()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, audioBlob);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);

      const msg = {
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '🎙️ Voice Note',
        audio_url: data.publicUrl,
        created_at: new Date().toISOString(),
      };

      await supabase.from('messages').insert([msg]);
    } catch (err: any) {
      console.error('Audio upload error:', err?.message || err);
    } finally {
      setUploading(false);
    }
  };

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <p className="text-sm text-blue-400 animate-pulse">Loading Chatbeep...</p>
      </div>
    );
  }

  // 1. Auth View
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen min-h-[100dvh] bg-black text-white p-4">
        <div className="w-full max-w-md bg-zinc-950 p-6 rounded-xl border border-blue-900/50 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-lg text-white">
              CB
            </div>
            <div>
              <h1 className="text-2xl font-bold text-blue-400">Chatbeep</h1>
              <p className="text-xs text-gray-400">Messaging Platform</p>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                placeholder="••••••••"
              />
            </div>

            {authError && <p className="text-red-400 text-xs">{authError}</p>}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg transition"
            >
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-xs text-blue-400 hover:underline"
            >
              {authMode === 'login'
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredContacts = contacts.filter((c) =>
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen h-[100dvh] bg-black text-white overflow-hidden relative">
      {/* Settings & Profile Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-blue-900/50 rounded-xl p-6 w-full max-w-md relative">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>Profile Settings</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Status Message
                </label>
                <input
                  type="text"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium text-sm transition"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-80 border-r border-blue-900/40 bg-zinc-950 flex flex-col shrink-0">
        {/* Sidebar Header & Profile Settings */}
        <div className="p-4 border-b border-blue-900/40 flex items-center justify-between bg-zinc-900/30">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
              CB
            </div>
            <span className="font-bold text-blue-400 text-lg">Chatbeep</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowSettings(true)}
              title="Settings & Profile"
              className="p-2 text-gray-400 hover:text-blue-400 hover:bg-zinc-900 rounded-lg transition"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              title="Log Out"
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* User Search Bar */}
        <div className="p-3 border-b border-zinc-900 flex space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search or friend's email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
              className="w-full bg-zinc-900 text-xs rounded-lg pl-9 pr-3 py-2 text-white border border-zinc-800 focus:outline-none focus:border-blue-500"
            />
          </div>
          {searchQuery.trim() && (
            <button
              onClick={handleAddContact}
              title="Add contact"
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Saved Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Conversations
          </p>

          {filteredContacts.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-gray-500">No saved conversations yet.</p>
              {searchQuery.trim() && (
                <button
                  onClick={handleAddContact}
                  className="mt-2 text-xs text-blue-400 hover:underline flex items-center justify-center space-x-1 w-full"
                >
                  <span>Chat with "{searchQuery}"</span>
                </button>
              )}
            </div>
          ) : (
            filteredContacts.map((c) => {
              const isSelected = selectedUser?.email === c.email;
              const isOnline = onlineUsers.has(c.email);
              const initials = c.email.substring(0, 2).toUpperCase();

              return (
                <button
                  key={c.email}
                  onClick={() => setSelectedUser(c)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-xl text-left transition ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                      : 'hover:bg-zinc-900/80 text-gray-300'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-blue-400">
                      {initials}
                    </div>
                    {isOnline ? (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-zinc-950 rounded-full flex items-center justify-center">
                        <Check className="w-2 h-2 text-black stroke-[3]" />
                      </span>
                    ) : (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-zinc-700 border-2 border-zinc-950 rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-xs font-semibold text-white truncate">{c.email}</p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Profile Card Footer */}
        <div className="p-3 border-t border-zinc-900 bg-zinc-900/50 flex items-center space-x-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
            {displayName.substring(0, 2).toUpperCase()}
          </div>
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
            {/* Top Chat Header */}
            <div className="p-4 border-b border-blue-900/40 flex items-center justify-between bg-zinc-950 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">
                    {selectedUser.email.substring(0, 2).toUpperCase()}
                  </div>
                  {onlineUsers.has(selectedUser.email) ? (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-black rounded
