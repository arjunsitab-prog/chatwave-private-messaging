'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import { Send, Image as ImageIcon, LogOut, Search, User as UserIcon, Plus } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  image_url?: string;
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

  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic document title
  useEffect(() => {
    document.title = 'Chatbeep';
  }, []);

  // Check auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync Realtime Presence
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

  // Handle Dynamic User Search / Manual Contact Addition
  const handleAddContact = () => {
    if (!searchQuery.trim()) return;
    const newContact: Contact = {
      id: searchQuery.trim(),
      email: searchQuery.trim(),
    };
    
    // Add to contact list if not already present
    if (!contacts.some((c) => c.email.toLowerCase() === newContact.email.toLowerCase())) {
      setContacts((prev) => [...prev, newContact]);
    }
    setSelectedUser(newContact);
  };

  // Auth Submit
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else alert('Account created! You can now log in.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !user || !selectedUser) return;

    const msg = {
      sender_id: user.email || user.id,
      recipient_id: selectedUser.email,
      content: newMessage,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, { ...msg, id: Math.random().toString() }]);
    setNewMessage('');

    await supabase.from('messages').insert([msg]);
  };

  // Upload Image Attachment
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user || !selectedUser) return;
    try {
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      const msg = {
        sender_id: user.email || user.id,
        recipient_id: selectedUser.email,
        content: '📷 Image Attachment',
        image_url: data.publicUrl,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, { ...msg, id: Math.random().toString() }]);
      await supabase.from('messages').insert([msg]);
    } catch (err: any) {
      console.error('Upload error:', err?.message || err);
    } finally {
      setUploading(false);
    }
  };

  // 1. Auth Login / Sign Up Screen
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
              <p className="text-xs text-gray-400">Real-time Messaging Platform</p>
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
    <div className="flex h-screen h-[100dvh] bg-black text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-blue-900/40 bg-zinc-950 flex flex-col shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-blue-900/40 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
              CB
            </div>
            <span className="font-bold text-blue-400 text-lg">Chatbeep</span>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* User Search Bar */}
        <div className="p-3 border-b border-zinc-900 flex space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search or type friend's email..."
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

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Active Contacts
          </p>
          
          {filteredContacts.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-gray-500">No contacts found.</p>
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
              return (
                <button
                  key={c.email}
                  onClick={() => setSelectedUser(c)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left transition ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                      : 'hover:bg-zinc-900 text-gray-400'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-blue-400">
                      {c.email.substring(0, 2).toUpperCase()}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-black ${
                        isOnline ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    />
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-sm font-medium text-white truncate">{c.email}</p>
                    <p className="text-xs text-gray-500">{isOnline ? 'Online' : 'Offline'}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Current User Info */}
        <div className="p-3 border-t border-zinc-900 bg-zinc-900/50 flex items-center space-x-2 shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <p className="text-xs text-gray-400 truncate">
            Logged in: <span className="text-white">{user.email}</span>
          </p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-black overflow-hidden">
        {selectedUser ? (
          <>
            {/* Top Header */}
            <div className="p-4 border-b border-blue-900/40 flex items-center justify-between bg-zinc-950 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">
                    {selectedUser.email.substring(0, 2).toUpperCase()}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-black ${
                      onlineUsers.has(selectedUser.email) ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  />
                </div>
                <div>
                  <h2 className="font-semibold text-blue-400">{selectedUser.email}</h2>
                  <p className="text-xs text-gray-500">
                    {onlineUsers.has(selectedUser.email) ? 'Online' : 'Offline'}
                  </p>
                </div>
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
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-xs md:max-w-md p-3 rounded-xl ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-zinc-900 text-gray-200 rounded-bl-none border border-zinc-800'
                        }`}
                      >
                        {msg.image_url && (
                          <img
                            src={msg.image_url}
                            alt="Attachment"
                            className="rounded-lg mb-2 max-h-60 object-cover"
                          />
                        )}
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-blue-900/40 flex items-center space-x-2 bg-zinc-950 shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                accept="image/*"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-zinc-900 rounded-lg transition shrink-0"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message ${selectedUser.email}...`}
                className="flex-1 bg-zinc-900 text-white px-4 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 text-sm"
              />
              <button
                type="submit"
                className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
            <UserIcon className="w-12 h-12 text-zinc-800" />
            <p className="text-sm">Search your friend's email on the left to start chatting!</p>
          </div>
        )}
      </div>
    </div>
  );
}
